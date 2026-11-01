"""Bounded local text settings shared by execution and capability reporting."""

MAX_TEXT_CONTEXT = 65536
MAX_TEXT_OUTPUT = 8192
DEFAULT_TEXT_CONTEXT = 8192


def text_context(body):
    context = body.get('context_length', MAX_TEXT_CONTEXT if body.get('tools') else DEFAULT_TEXT_CONTEXT)
    if not isinstance(context, int) or isinstance(context, bool) or not 2048 <= context <= MAX_TEXT_CONTEXT:
        raise ValueError(f'Local text context supports 2048 to {MAX_TEXT_CONTEXT} tokens')
    return context
