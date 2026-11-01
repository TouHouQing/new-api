"""Bounded CPU measurements; no URLs, model loading, downloads or media edits.

Audio and optical-flow methods retain the New API production analysis behavior.
Outputs describe evidence and uncertainty; editorial decisions remain editable.
"""
import json
import math
from pathlib import Path
import subprocess

ENGINE_VERSION = 1


def number(value, name, low, high):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(name + ' is outside the supported range')
    return float(value)


def audio_structure(path):
    import librosa
    import numpy as np
    import soundfile as sf
    info = sf.info(path)
    if info.channels != 1 or info.samplerate != 22050 or not 0.05 <= info.duration <= 61:
        raise ValueError('Provide a mono 22050 Hz WAV interval of at most 61 seconds')
    samples, sr = sf.read(path, dtype='float32')
    if not np.isfinite(samples).all():
        raise ValueError('Audio contains non-finite samples')
    hop = 256
    rms = librosa.feature.rms(y=samples, frame_length=1024, hop_length=hop)[0]
    envelope = librosa.onset.onset_strength(y=samples, sr=sr, hop_length=hop)
    silent = float(np.max(np.abs(samples))) < 1e-5
    tempo, beats = (np.array([0.0]), np.array([], dtype=int)) if silent else librosa.beat.beat_track(onset_envelope=envelope, sr=sr, hop_length=hop, trim=False)
    beat_times = [round(float(value), 6) for value in librosa.frames_to_time(beats, sr=sr, hop_length=hop) if 0 <= value < info.duration]
    onsets = librosa.onset.onset_detect(onset_envelope=envelope, sr=sr, hop_length=hop, units='time') if not silent else np.array([])
    support = sum(1 for value in beat_times if len(onsets) and float(np.min(np.abs(onsets-value))) <= 0.08) / max(1, len(beat_times))
    if len(onsets) < 3 or support < 0.4:
        beat_times = []
    boundaries = [0.0]
    if not silent and info.duration >= 4:
        chroma = librosa.feature.chroma_stft(y=samples, sr=sr, hop_length=hop, n_fft=1024)
        feature = np.vstack([chroma, rms[None, :] / max(float(rms.max()), 1e-8)])
        lag = max(1, round(sr/hop))
        novelty = np.mean(np.abs(feature[:, lag:] - feature[:, :-lag]), axis=0)
        candidates = np.flatnonzero(novelty > max(0.12, float(np.percentile(novelty, 92)))) + lag
        for frame in candidates:
            seconds = float(librosa.frames_to_time(frame, sr=sr, hop_length=hop))
            if seconds-boundaries[-1] >= 3 and info.duration-seconds >= 2:
                boundaries.append(round(seconds, 6))
    boundaries.append(round(info.duration, 6))
    sections = []
    for start, end in zip(boundaries, boundaries[1:]):
        first, last = int(start*sr/hop), max(int(end*sr/hop), int(start*sr/hop)+1)
        level = float(np.mean(rms[first:last])) if len(rms[first:last]) else 0
        sections.append({'start':start,'end':end,'label':'silence' if level < 1e-5 else 'section_candidate','rms_db':round(20*math.log10(max(level,1e-10)),2),'review_required':True})
    return {'kind':'audio_structure','method':'librosa onset/beat tracking + chroma/energy novelty','duration':round(info.duration,6),'silent':silent,'tempo_bpm':round(float(np.asarray(tempo).reshape(-1)[0]),3) if len(beat_times)>=3 else None,'beat_times':beat_times,'beat_onset_support':round(support,4),'sections':sections,'review_required':True,'limitations':['Beat grids may have half/double-tempo ambiguity; onset support is a diagnostic, not a probability.','Sections indicate acoustic changes; verse/chorus naming needs human review.','No speech recognition or model download is performed.']}


def read_video(path, ffmpeg):
    import cv2
    ffprobe = str(Path(ffmpeg).with_name('ffprobe'+Path(ffmpeg).suffix))
    probe = json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-show_entries','format=duration:stream=width,height','-of','json',str(path)],timeout=30))
    duration = float(probe['format']['duration'])
    if not math.isfinite(duration) or not 0.05 <= duration <= 120.1:
        raise ValueError('Video analysis supports intervals of at most 120 seconds')
    streams = probe.get('streams') or []
    if len(streams)!=1 or min(streams[0]['width'],streams[0]['height'])<=0 or max(streams[0]['width'],streams[0]['height'])>480:
        raise ValueError('Normalize video to a maximum side of 480 pixels')
    probe = json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-read_intervals','%+#30001','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)],timeout=60))
    timestamps = [float(item['best_effort_timestamp_time']) for item in probe.get('frames',[]) if 'best_effort_timestamp_time' in item]
    if not timestamps or len(timestamps)>30000 or any(not math.isfinite(value) or value<0 for value in timestamps) or any(b<a for a,b in zip(timestamps,timestamps[1:])):
        raise ValueError('Video presentation timestamps are invalid or exceed the limit')
    capture = cv2.VideoCapture(str(path))
    frames, times, last = [], [], -1.0
    try:
        for pts in timestamps:
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Video ended before its presentation timestamps')
            if pts-last < 0.124999:
                continue
            if max(frame.shape[:2])>480:
                raise ValueError('Video dimensions changed during decode')
            if frames and frame.shape!=frames[0].shape:
                raise ValueError('Video dimensions changed during decode')
            frames.append(frame)
            times.append(pts)
            last = pts
            if sum(value.nbytes for value in frames)>330_000_000:
                raise ValueError('Decoded memory limit exceeded; choose a shorter interval')
    finally:
        capture.release()
    if not frames:
        raise ValueError('Video has no decodable frames')
    return duration, frames, times


def reference_video(path, ffmpeg, options):
    import cv2
    import numpy as np
    duration, frames, times = read_video(path,ffmpeg)
    if duration>61:
        raise ValueError('Reference analysis supports intervals of at most 60 seconds')
    threshold = number(options.get('threshold',0.45),'threshold',0.15,0.95)
    boundaries, cuts = [0.0], []
    previous_hist = previous_gray = previous_luma_hist = None
    for frame, pts in zip(frames,times):
        hsv = cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv],[0,1],None,[32,32],[0,180,0,256])
        cv2.normalize(hist,hist)
        gray = cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
        luma_hist = cv2.calcHist([gray],[0],None,[32],[0,256])
        cv2.normalize(luma_hist,luma_hist)
        if previous_hist is not None:
            distance = float(cv2.compareHist(previous_hist,hist,cv2.HISTCMP_BHATTACHARYYA))
            luminance_distance = float(cv2.compareHist(previous_luma_hist,luma_hist,cv2.HISTCMP_BHATTACHARYYA))
            change = float(np.mean(cv2.absdiff(previous_gray,gray)))/255
            # Hue/saturation alone cannot distinguish black from white. Require
            # a strong pixel change for this additional luminance candidate.
            colour_cut = distance>=threshold and change>=0.035
            luminance_cut = luminance_distance>=threshold and change>=0.20
            if (colour_cut or luminance_cut) and pts-boundaries[-1]>=0.35 and duration-pts>=0.15:
                boundaries.append(round(pts,6))
                cuts.append({'time':round(pts,6),'histogram_distance':round(distance,6),'luminance_distance':round(luminance_distance,6),'pixel_change':round(change,6),'review_required':True})
        previous_hist, previous_gray, previous_luma_hist = hist, gray, luma_hist
    boundaries.append(round(duration,6))
    return {'kind':'reference_video','method':'CPU HSV histogram + strong luminance/pixel-change candidates','duration':round(duration,6),'threshold':threshold,'cuts':cuts,'sections':[{'start':start,'end':end,'label':'shot_candidate','review_required':True} for start,end in zip(boundaries,boundaries[1:])],'review_required':True,'limitations':['Samples actual presentation timestamps at up to 8 Hz.','Flashes, fades and camera movement can create or hide candidate cuts.','No claim of visual story understanding or automatic character identity.']}


def subject_track(path, ffmpeg, options):
    import cv2
    import numpy as np
    duration, color_frames, times = read_video(path,ffmpeg)
    anchor = number(options.get('anchor_time',0),'anchor_time',0,max(0,duration-0.001))
    requested = options.get('roi')
    if not isinstance(requested,dict) or set(requested)!={'x','y','width','height'}:
        raise ValueError('Select an initial subject rectangle')
    roi = [number(requested.get(key),'roi.'+key,0,1) for key in ['x','y','width','height']]
    if roi[2]<=0 or roi[3]<=0 or roi[0]+roi[2]>1.000001 or roi[1]+roi[3]>1.000001:
        raise ValueError('Subject rectangle is outside the frame')
    aspect = number(options.get('target_aspect',9/16),'target_aspect',0.25,4)
    frames = [cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY) for frame in color_frames]
    del color_frames
    height,width = frames[0].shape
    anchor_index = min(range(len(times)),key=lambda i:abs(times[i]-anchor))
    initial = np.array([roi[0]*width,roi[1]*height,roi[2]*width,roi[3]*height],dtype=np.float32)
    if min(initial[2:])<8:
        raise ValueError('Subject rectangle must cover at least 8 decoded pixels on each side')
    points = [None]*len(frames)

    def output(index,box,confidence,reason):
        normalized = [float(box[0]/width),float(box[1]/height),float(box[2]/width),float(box[3]/height)]
        crop_w,crop_h = (height*aspect,height) if width/height>=aspect else (width,width/aspect)
        center_x,center_y = box[0]+box[2]/2,box[1]+box[3]/2
        left,top = min(max(center_x-crop_w/2,0),width-crop_w),min(max(center_y-crop_h/2,0),height-crop_h)
        fits = box[2]<=crop_w and box[3]<=crop_h
        return {'time':round(times[index],6),'roi':dict(zip(['x','y','width','height'],[round(value,6) for value in normalized])),'confidence':round(confidence,4),'review_required':bool(reason or confidence<0.65 or not fits),'reason':reason or ('' if fits else 'subject_does_not_fit_target'),'crop':{'x':round(float(left/width),6),'y':round(float(top/height),6),'width':round(float(crop_w/width),6),'height':round(float(crop_h/height),6)}}

    points[anchor_index] = output(anchor_index,initial,1.0,'user_selected_anchor')
    for step in [-1,1]:
        box,previous,failed = initial.copy(),frames[anchor_index],''
        for index in range(anchor_index+step,len(frames) if step>0 else -1,step):
            current,confidence = frames[index],0.0
            if not failed:
                mask = np.zeros_like(previous)
                x,y,w,h = np.round(box).astype(int)
                mask[max(0,y):min(height,y+h),max(0,x):min(width,x+w)]=255
                corners = cv2.goodFeaturesToTrack(previous,maxCorners=120,qualityLevel=0.015,minDistance=3,mask=mask)
                if float(np.mean(cv2.absdiff(previous,current)))/255>0.34:
                    failed = 'scene_cut_or_large_change'
                elif corners is None or len(corners)<5:
                    failed = 'insufficient_subject_features'
                else:
                    following,valid,_ = cv2.calcOpticalFlowPyrLK(previous,current,corners,None,winSize=(31,31),maxLevel=3)
                    if following is None or valid is None:
                        failed = 'occluded_or_lost'
                    else:
                        back,back_valid,_ = cv2.calcOpticalFlowPyrLK(current,previous,following,None,winSize=(31,31),maxLevel=3)
                        if back is None or back_valid is None:
                            failed = 'occluded_or_lost'
                        else:
                            errors = np.linalg.norm(corners.reshape(-1,2)-back.reshape(-1,2),axis=1)
                            keep = (valid.reshape(-1)==1)&(back_valid.reshape(-1)==1)&(errors<1.5)
                            if int(keep.sum())<5:
                                failed = 'occluded_or_lost'
                            else:
                                motion = following.reshape(-1,2)[keep]-corners.reshape(-1,2)[keep]
                                delta = np.median(motion,axis=0)
                                confidence = float(keep.mean()*(np.linalg.norm(motion-delta,axis=1)<3).mean())
                                candidate = box.copy()
                                candidate[:2]+=delta
                                nx,ny,nw,nh = np.round(candidate).astype(int)
                                if nx<0 or ny<0 or nx+nw>width or ny+nh>height:
                                    failed = 'subject_out_of_frame'
                                else:
                                    original,patch = previous[y:y+h,x:x+w],current[ny:ny+nh,nx:nx+nw]
                                    similarity = float(cv2.matchTemplate(patch,original,cv2.TM_CCOEFF_NORMED)[0,0]) if original.shape==patch.shape and original.size else 0
                                    if not math.isfinite(similarity) or similarity<0.35 or confidence<0.45:
                                        failed = 'appearance_changed_or_occluded'
                                    else:
                                        box = candidate
                                        confidence*=max(0,min(1,similarity))
                if failed:
                    confidence=0.0
            points[index]=output(index,box,confidence,failed)
            previous=current
    return {'kind':'subject_track','method':'CPU Lucas-Kanade forward/backward optical flow + appearance/cut checks','duration':round(duration,6),'width':width,'height':height,'anchor_time':round(times[anchor_index],6),'target_aspect':aspect,'points':points,'review_required':any(point['review_required'] for point in points),'limitations':['The initial ROI is user-selected, not automatic person recognition.','Loss, occlusion or a scene change stops trusted tracking until a new user anchor.','Actual presentation timestamps are sampled at up to 8 Hz.','Translation only; scale and deformation require manual correction.']}


def analyze(path, ffmpeg, action, options):
    if not isinstance(options,dict):
        raise ValueError('Analysis options must be an object')
    allowed = {'audio_structure':set(),'reference_video':{'threshold'},'subject_track':{'roi','anchor_time','target_aspect'}}
    if action not in allowed or set(options)-allowed[action]:
        raise ValueError('Unsupported analysis action or options')
    result = audio_structure(path) if action=='audio_structure' else reference_video(path,ffmpeg,options) if action=='reference_video' else subject_track(path,ffmpeg,options)
    result['engine_version']=ENGINE_VERSION
    return result
