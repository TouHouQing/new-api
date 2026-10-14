import sys, unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_model_adapter import LocalModels, LocalInferenceFailure, ollama_text_request

class ModelMemoryCleanupTest(unittest.TestCase):
    def test_text_request_releases_cpu_weights_before_the_image_encoder_loads(self):
        request = ollama_text_request('qwen3.5:9b', [{'role':'user','content':'Hello'}], 4096, 512)
        self.assertEqual(request['keep_alive'], 0)
        self.assertEqual(request['options']['num_gpu'], 0)
        self.assertEqual(request['options']['num_ctx'], 4096)

    def test_terminal_memory_failure_is_distinct_from_a_lost_submission_and_releases_owned_models(self):
        models=LocalModels.__new__(LocalModels);models.args=SimpleNamespace(comfy='http://127.0.0.1:8288');models.configure_text_encoders=lambda graph:graph;models.workflow=lambda family,values:{'save':{'class_type':'SaveImage','inputs':{}}};calls=[]
        def request(url,body=None,timeout=None):
            calls.append((url,body))
            if url.endswith('/queue'):return {}
            if url.endswith('/system_stats'):return {'devices':[{'type':'cuda'}]}
            if url.endswith('/prompt'):return {'prompt_id':'own-failure'}
            if '/history/' in url:return {'own-failure':{'status':{'status_str':'error','messages':[['execution_error',{'exception_message':'DefaultCPUAllocator: not enough memory'}]]}}}
            return {}
        models.http_json=request
        with self.assertRaisesRegex(LocalInferenceFailure,'memory is exhausted'):models.comfy_reference('image',{'prompt':'test'},[])
        self.assertEqual(len([url for url,body in calls if url.endswith('/free')]),2)
    def test_successful_private_inference_releases_cpu_graphs_without_touching_queued_jobs(self):
        models=LocalModels.__new__(LocalModels)
        models.args=SimpleNamespace(comfy='http://127.0.0.1:8288')
        models.configure_text_encoders=lambda graph:graph
        models.workflow=lambda family,values:{'save':{'class_type':'SaveImage','inputs':{}}}
        calls=[]
        def request(url,body=None,timeout=None):
            calls.append((url,body))
            if url.endswith('/queue'):return {'queue_running':[],'queue_pending':[]}
            if url.endswith('/system_stats'):return {'devices':[{'type':'cuda','name':'local GPU'}]}
            if url.endswith('/prompt'):return {'prompt_id':'own-test'}
            if '/history/' in url:return {'own-test':{'status':{'completed':True},'prompt':[0,0,{'save':{'class_type':'SaveImage'}}],'outputs':{'save':{'images':[{'filename':'own.png','type':'output'}]}}}}
            return {}
        models.http_json=request
        result=models.comfy_reference('image',{'prompt':'test'},[])
        self.assertEqual(result['prompt_id'],'own-test')
        releases=[body for url,body in calls if url.endswith('/free')]
        self.assertEqual(releases,[{'unload_models':True,'free_memory':True}]*2)
        self.assertFalse(any('/interrupt' in url or '/queue' in url and body is not None for url,body in calls))

if __name__=='__main__':unittest.main()
