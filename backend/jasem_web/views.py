"""HTTP entry points: one view per jasem CLI capability.

Views only decode the request, call :class:`~jasem_web.services.WebService`, and
encode the result. Every rule about what jasem accepts lives in the service.
"""

import json

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .services import ApiError, WebService

OPENAPI_PATH = "/api/openapi.yaml"
"""Where the specification is served, for the docs page to load."""

SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14"
"""Pinned Swagger UI bundle used by the interactive docs page."""

DOCS_PAGE = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jasem Web API</title>
<link rel="stylesheet" href="{SWAGGER_UI}/swagger-ui.css">
</head>
<body>
<div id="swagger"></div>
<script src="{SWAGGER_UI}/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({{ url: "{OPENAPI_PATH}", dom_id: "#swagger", deepLinking: true }});
</script>
</body>
</html>
"""
"""Standalone Swagger UI page; the spec itself is served from the repo file."""


def _service():
    """Build the per-request service, reporting a bad configuration as a 400."""
    return WebService()


def _body(request):
    """Return the decoded JSON body, or ``None`` when it is malformed."""
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return None


def _error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def _payload(request):
    """Return the JSON body, raising the CLI's error for malformed input."""
    body = _body(request)
    if body is None or not isinstance(body, dict):
        raise ApiError("invalid JSON body")
    return body


def _text(body):
    """Return the required free-text field of a capture request."""
    text = str(body.get("text", "")).strip()
    if not text:
        raise ApiError("text is required")
    return text


def api(handler):
    """Wrap a view so an :class:`ApiError` becomes its JSON error response."""
    def wrapped(request, *args, **kwargs):
        try:
            return handler(request, *args, **kwargs)
        except ApiError as error:
            return _error(error.message, error.status)
    wrapped.__name__ = handler.__name__
    wrapped.__doc__ = handler.__doc__
    return wrapped


def _tags(request):
    """Return the repeated ``tag`` filters of a task query."""
    return request.GET.getlist("tag") or (
        [request.GET["tags"]] if request.GET.get("tags") else []
    )


# --------------------------------------------------------------- meta & docs

@require_http_methods(["GET"])
def health(request):
    """Report that the server is up."""
    return JsonResponse({"ok": True, "service": "jasem-web"})


@api
@require_http_methods(["GET"])
def meta(request):
    """``jasem --version`` — version, links, and the welcome screen."""
    return JsonResponse(_service().meta())


@api
@require_http_methods(["GET"])
def help_reference(request):
    """``jasem help`` — every command, mapped to the endpoint that performs it."""
    return JsonResponse(_service().command_reference())


@api
@require_http_methods(["GET"])
def configuration(request):
    """``jasem help`` files & config — provider, model, files, and calendar."""
    return JsonResponse(_service().configuration())


@require_http_methods(["GET"])
def openapi(request):
    """Serve the OpenAPI specification kept beside the code."""
    from pathlib import Path
    spec = Path(__file__).resolve().parent.parent / "openapi.yaml"
    return HttpResponse(spec.read_text(encoding="utf-8"), content_type="application/yaml")


@require_http_methods(["GET"])
def docs(request):
    """Serve the Swagger UI page for the specification."""
    return HttpResponse(DOCS_PAGE, content_type="text/html; charset=utf-8")


@api
@require_http_methods(["GET"])
def dashboard(request):
    """``jasem`` with no arguments — focus tasks and today's activity."""
    return JsonResponse(_service().dashboard())


# ---------------------------------------------------------------------- tasks

@csrf_exempt
@api
@require_http_methods(["GET", "POST"])
def tasks(request):
    """``jasem todo`` views, and ``jasem todo "<text>"`` to capture one."""
    service = _service()
    if request.method == "GET":
        selected = request.GET.get("list")
        found = service.task_list(request.GET.get("view", "open"), _tags(request), selected)
        return JsonResponse({
            "list": selected if selected is not None else service.list_name,
            "view": request.GET.get("view", "open"),
            "tasks": [service._task_json(task) for task in found],
        })
    body = _payload(request)
    task, created_list = service.add_task(_text(body), body.get("list"))
    return JsonResponse({
        "task": service._task_json(task),
        "created_list": created_list,
        "warnings": service.warnings,
    }, status=201)


@api
@require_http_methods(["GET"])
def task_lists(request):
    """``jasem todo lists`` — every list with its open and total counts."""
    return JsonResponse({"lists": _service().task_lists()})


@api
@require_http_methods(["GET"])
def task_tags(request):
    """``jasem todo tags`` — categories in use, over open tasks by default."""
    service = _service()
    tags = service.task_tags(request.GET.get("list"), request.GET.get("view", "open"))
    return JsonResponse({"tags": tags})


@api
@require_http_methods(["GET"])
def task_find(request):
    """``jasem todo find "…"`` — search task titles and tags."""
    service = _service()
    found = service.find_tasks(request.GET.get("q", ""), request.GET.get("list"))
    return JsonResponse({"tasks": [service._task_json(task) for task in found]})


@csrf_exempt
@api
@require_http_methods(["POST"])
def task_move(request):
    """``jasem todo move <id>… <list>`` — move tasks to another list."""
    service = _service()
    body = _payload(request)
    if "target" not in body:
        raise ApiError("ids and target are required")
    moved = service.move_tasks(body.get("ids"), body["target"], body.get("source"))
    return JsonResponse({"tasks": [service._task_json(task) for task in moved]})


@csrf_exempt
@api
@require_http_methods(["POST"])
def task_done(request):
    """``jasem todo done <id>…`` — complete (or reopen) several tasks at once."""
    service = _service()
    body = _payload(request)
    changed = service.complete_tasks(body.get("ids"), body.get("done", True), body.get("list"))
    return JsonResponse({"tasks": [service._task_json(task) for task in changed]})


@csrf_exempt
@api
@require_http_methods(["POST"])
def task_delete(request):
    """``jasem todo rm <id>…`` — delete several tasks at once."""
    body = _payload(request)
    removed = _service().delete_tasks(body.get("ids"), body.get("list"))
    return JsonResponse({"deleted": removed})


@csrf_exempt
@api
@require_http_methods(["PATCH", "DELETE"])
def task_detail(request, task_id):
    """``jasem todo set <id> …`` and ``jasem todo rm <id>``."""
    service = _service()
    selected = request.GET.get("list")
    if request.method == "DELETE":
        service.delete_task(task_id, selected)
        return JsonResponse({"deleted": 1})
    task = service.update_task(task_id, _payload(request), selected)
    return JsonResponse({"task": service._task_json(task), "warnings": service.warnings})


# ----------------------------------------------------------------------- time

@csrf_exempt
@api
@require_http_methods(["GET", "POST"])
def time_entries(request):
    """``jasem track list`` and ``jasem track "<text>"``."""
    service = _service()
    if request.method == "GET":
        if request.GET.get("report") == "1":
            return JsonResponse(service.reports(
                "time", request.GET.get("period", "week"), request.GET.get("tag")))
        entries, label = service.time_list(
            request.GET.get("period", "all"), request.GET.get("tag"))
        return JsonResponse({
            "label": label,
            "entries": [service._time_json(entry) for entry in entries],
        })
    entry = service.add_time(_text(_payload(request)))
    return JsonResponse({"entry": service._time_json(entry),
                         "warnings": service.warnings}, status=201)


@api
@require_http_methods(["GET"])
def time_report(request):
    """``jasem track report [period] [tag]`` — totals, by-tag, and timeline."""
    service = _service()
    return JsonResponse(service.reports(
        "time", request.GET.get("period", "week"), request.GET.get("tag")))


@api
@require_http_methods(["GET"])
def time_tags(request):
    """``jasem track tags`` — categories in use, with counts."""
    return JsonResponse({"tags": _service().time_tags()})


@csrf_exempt
@api
@require_http_methods(["POST"])
def time_delete(request):
    """``jasem track rm <id>…`` — delete several entries at once."""
    removed = _service().delete_time_entries(_payload(request).get("ids"))
    return JsonResponse({"deleted": removed})


@csrf_exempt
@api
@require_http_methods(["PATCH", "DELETE"])
def time_detail(request, entry_id):
    """``jasem track set <id> …`` and ``jasem track rm <id>``."""
    service = _service()
    if request.method == "DELETE":
        service.delete_time(entry_id)
        return JsonResponse({"deleted": 1})
    entry = service.update_time(entry_id, _payload(request))
    return JsonResponse({"entry": service._time_json(entry), "warnings": service.warnings})


# ------------------------------------------------------------------- spending

@csrf_exempt
@api
@require_http_methods(["GET", "POST"])
def spending(request):
    """``jasem acc list`` and ``jasem acc "<text>"``."""
    service = _service()
    if request.method == "GET":
        if request.GET.get("report") == "1":
            return JsonResponse(service.reports(
                "spending", request.GET.get("period", "week"), request.GET.get("tag")))
        records, label = service.spending_list(
            request.GET.get("period", "all"), request.GET.get("tag"))
        return JsonResponse({
            "label": label,
            "records": [service._spending_json(record) for record in records],
        })
    record = service.add_spending(_text(_payload(request)))
    return JsonResponse({"record": service._spending_json(record),
                         "warnings": service.warnings}, status=201)


@api
@require_http_methods(["GET"])
def spending_report(request):
    """``jasem acc report [period] [tag]`` — totals, by-tag, and timeline."""
    service = _service()
    return JsonResponse(service.reports(
        "spending", request.GET.get("period", "week"), request.GET.get("tag")))


@api
@require_http_methods(["GET"])
def spending_tags(request):
    """``jasem acc tags`` — categories in use, with counts."""
    return JsonResponse({"tags": _service().spending_tags()})


@csrf_exempt
@api
@require_http_methods(["POST"])
def spending_delete(request):
    """``jasem acc rm <id>…`` — delete several records at once."""
    removed = _service().delete_spending_records(_payload(request).get("ids"))
    return JsonResponse({"deleted": removed})


@csrf_exempt
@api
@require_http_methods(["PATCH", "DELETE"])
def spending_detail(request, record_id):
    """``jasem acc set <id> …`` and ``jasem acc rm <id>``."""
    service = _service()
    if request.method == "DELETE":
        service.delete_spending(record_id)
        return JsonResponse({"deleted": 1})
    record = service.update_spending(record_id, _payload(request))
    return JsonResponse({"record": service._spending_json(record),
                         "warnings": service.warnings})
