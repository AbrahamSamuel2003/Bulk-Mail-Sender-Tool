import asyncio
import logging

from app.workers.reply_tasks import poll_gmail_inbox
from app.workers.sending_tasks import dispatch_due_jobs

logger = logging.getLogger(__name__)


async def _run_periodic(name: str, interval_seconds: int, fn) -> None:
    while True:
        try:
            await asyncio.to_thread(fn)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Background task %s error: %s", name, exc)
        await asyncio.sleep(interval_seconds)


class LocalScheduler:
    """Lightweight in-process background scheduler replacing Celery + Redis."""

    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []

    def start(self) -> None:
        if self._tasks:
            return
        self._tasks = [
            asyncio.create_task(_run_periodic("dispatch_due_jobs", 15, dispatch_due_jobs)),
            asyncio.create_task(_run_periodic("poll_gmail_inbox", 120, poll_gmail_inbox)),
        ]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

