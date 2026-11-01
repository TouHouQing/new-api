package app

import (
	"context"
	"errors"
	"io"
	"os"

	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func (s *Service) materializeNativeImageEdit(ctx context.Context, task *model.Task, checkpoint *mediaCheckpoint, item *mediaCheckpointItem, path string) (string, error) {
	edit, signature, err := nativeImageEditForTask(task)
	if err != nil {
		return "", err
	}
	if edit == nil {
		if item.NativeImageEditSHA256 != "" {
			return "", errors.New("暂存图片包含无对应原任务的处理回执")
		}
		return path, nil
	}
	if checkpoint.Mode != "image" {
		return "", errors.New("局部图片处理不能用于其他媒体结果")
	}
	if item.NativeImageEditSHA256 != "" {
		if item.NativeImageEditSHA256 != signature {
			return "", errors.New("暂存图片处理配方与原任务不匹配")
		}
		return path, nil
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > imageops.MaxSourceBytes {
		return "", errors.New("图片候选暂存文件无效或超过32MB处理上限")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	data, err := io.ReadAll(io.LimitReader(file, imageops.MaxSourceBytes+1))
	closeErr := file.Close()
	if err != nil {
		return "", err
	}
	if closeErr != nil {
		return "", closeErr
	}
	generatedSource, err := imageops.Inspect(data)
	if err != nil {
		return "", err
	}
	memory := int64(edit.Source.Width)*int64(edit.Source.Height)*32 + int64(generatedSource.Width)*int64(generatedSource.Height)*16
	if memory > imageOperationMemoryBudget {
		return "", errors.New("局部图片处理所需内存超过处理上限")
	}
	if err := imageOperationMemory.Acquire(ctx, memory); err != nil {
		return "", err
	}
	defer imageOperationMemory.Release(memory)
	originalBytes, err := s.readImageOperationSource(task.UserID, edit.ResourceID)
	if err != nil {
		return "", err
	}
	original, err := imageops.Decode(ctx, originalBytes, edit.Source)
	if err != nil {
		return "", err
	}
	generated, err := imageops.Decode(ctx, data, generatedSource)
	if err != nil {
		return "", err
	}
	outputWidth, outputHeight := edit.Source.Width, edit.Source.Height
	if edit.Emotion != nil {
		outputWidth, outputHeight = edit.Emotion.Region.Width, edit.Emotion.Region.Height
	}
	if generatedSource.Width != outputWidth || generatedSource.Height != outputHeight {
		pieces, err := imageops.Plan(generatedSource.Width, generatedSource.Height, imageops.Recipe{Operation: "normalize", Normalize: &imageops.Normalize{Width: outputWidth, Height: outputHeight, Algorithm: "high"}})
		if err != nil {
			return "", err
		}
		data, err = imageops.RenderPNG(ctx, generated, pieces[0], "high")
		if err != nil {
			return "", err
		}
		normalized, err := imageops.Inspect(data)
		if err != nil {
			return "", err
		}
		generated, err = imageops.Decode(ctx, data, normalized)
		if err != nil {
			return "", err
		}
	}
	var derived []byte
	if edit.Emotion != nil {
		derived, err = imageops.RenderEmotionCompositePNG(ctx, original, generated, *edit.Emotion)
	} else {
		derived, err = imageops.RenderMaskedCompositePNG(ctx, original, generated, *edit.Mask)
	}
	if err != nil {
		return "", err
	}
	name, err := s.stageInlineMedia(derived)
	if err != nil {
		return "", err
	}
	oldName, oldMIME := item.TempName, item.MIMEType
	item.TempName, item.MIMEType, item.NativeImageEditSHA256 = name, "image/png", signature
	if err := s.saveMediaCheckpoint(task, checkpoint, "local_save"); err != nil {
		// A failed database reply may have committed. Keep both temporary files;
		// recovery reads the durable checkpoint and never repeats inference.
		item.TempName, item.MIMEType, item.NativeImageEditSHA256 = oldName, oldMIME, ""
		return "", err
	}
	if oldName != name {
		_ = os.Remove(s.mediaTempPath(oldName))
	}
	return s.mediaTempPath(name), nil
}
