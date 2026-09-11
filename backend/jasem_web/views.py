import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .services import WebService


def _body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return None


def _error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def health(request):
    return JsonResponse({"ok": True, "service": "jasem-web"})


@require_http_methods(["GET"])
def dashboard(request):
    return JsonResponse(WebService().dashboard())


@csrf_exempt
@require_http_methods(["GET", "POST"])
def tasks(request):
    service = WebService()
    if request.method == "GET":
        view = request.GET.get("view", "open")
        tags = request.GET.getlist("tag") or ([request.GET["tags"]] if request.GET.get("tags") else [])
        return JsonResponse({"tasks": [service._task_json(task) for task in service.task_list(view, tags)]})
    body = _body(request)
    if not body or not str(body.get("text", "")).strip():
        return _error("text is required")
    task = service.add_task(str(body["text"]), body.get("list"))
    return JsonResponse({"task": service._task_json(task)}, status=201)


@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def task_detail(request, task_id):
    service = WebService()
    if request.method == "DELETE":
        try:
            service.delete_task(task_id)
        except KeyError:
            return _error("task not found", 404)
        return JsonResponse({"deleted": True})
    body = _body(request)
    if body is None:
        return _error("invalid JSON")
    try:
        task = service.update_task(task_id, body)
    except KeyError:
        return _error("task not found", 404)
    return JsonResponse({"task": service._task_json(task)})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def time_entries(request):
    service = WebService()
    if request.method == "GET":
        if request.GET.get("report") == "1":
            return JsonResponse(service.reports("time", request.GET.get("period", "week"), request.GET.get("tag")))
        entries = service.time_list(request.GET.get("period", "all"), request.GET.get("tag"))
        return JsonResponse({"entries": [service._time_json(entry) for entry in entries]})
    body = _body(request)
    if not body or not str(body.get("text", "")).strip():
        return _error("text is required")
    entry = service.add_time(str(body["text"]))
    return JsonResponse({"entry": service._time_json(entry)}, status=201)


@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def time_detail(request, entry_id):
    service = WebService()
    try:
        if request.method == "DELETE":
            service.delete_time(entry_id)
            return JsonResponse({"deleted": True})
        body = _body(request)
        if body is None:
            return _error("invalid JSON")
        entry = service.update_time(entry_id, body)
        return JsonResponse({"entry": service._time_json(entry)})
    except KeyError:
        return _error("time entry not found", 404)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def spending(request):
    service = WebService()
    if request.method == "GET":
        if request.GET.get("report") == "1":
            return JsonResponse(service.reports("spending", request.GET.get("period", "week"), request.GET.get("tag")))
        records = service.spending_list(request.GET.get("period", "all"), request.GET.get("tag"))
        return JsonResponse({"records": [service._spending_json(record) for record in records]})
    body = _body(request)
    if not body or not str(body.get("text", "")).strip():
        return _error("text is required")
    record = service.add_spending(str(body["text"]))
    return JsonResponse({"record": service._spending_json(record)}, status=201)


@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def spending_detail(request, record_id):
    service = WebService()
    try:
        if request.method == "DELETE":
            service.delete_spending(record_id)
            return JsonResponse({"deleted": True})
        body = _body(request)
        if body is None:
            return _error("invalid JSON")
        record = service.update_spending(record_id, body)
        return JsonResponse({"record": service._spending_json(record)})
    except KeyError:
        return _error("spending record not found", 404)
