"""Serialize GPU inference across local adapter and media worker processes."""
import os
import time
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def gpu_lease(directory, timeout=1800):
    path = Path(directory).resolve() / 'gpu-inference.lock'
    stream = path.open('a+b')
    if path.stat().st_size == 0:
        stream.write(b'0')
        stream.flush()
    acquired = False
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            try:
                stream.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except BlockingIOError:
                time.sleep(.1)
            except OSError as error:
                if error.errno not in [11, 13, 36]:
                    raise
                time.sleep(.1)
        if not acquired:
            raise TimeoutError('Local GPU inference is busy; wait for the existing task before retrying')
        yield
    finally:
        if acquired:
            stream.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        stream.close()
