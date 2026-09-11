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
        selected_list = request.GET.get("list")
        try:
            values = service.task_list(view, tags, selected_list)
        except ValueError as error:
            return _error(str(error))
        return JsonResponse({"list": selected_list if selected_list is not None else service.list_name,
                             "tasks": [service._task_json(task) for task in values]})
    body = _body(request)
    if not body or not str(body.get("text", "")).strip():
        return _error("text is required")
    try:
        task = service.add_task(str(body["text"]), body.get("list"))
    except ValueError as error:
        return _error(str(error))
    return JsonResponse({"task": service._task_json(task)}, status=201)


@require_http_methods(["GET"])
def task_lists(request):
    return JsonResponse({"lists": WebService().task_lists()})


@require_http_methods(["GET"])
def task_tags(request):
    service = WebService()
    try:
        tags = service.task_tags(request.GET.get("list"))
    except ValueError as error:
        return _error(str(error))
    return JsonResponse({"tags": tags})


@require_http_methods(["GET"])
def task_find(request):
    service = WebService()
    query = request.GET.get("q", "")
    try:
        tasks_found = service.find_tasks(query, request.GET.get("list"))
    except ValueError as error:
        return _error(str(error))
    return JsonResponse({"tasks": [service._task_json(task) for task in tasks_found]})


@csrf_exempt
@require_http_methods(["POST"])
def task_move(request):
    service = WebService()
    body = _body(request)
    if not body or not isinstance(body.get("ids"), list) or "target" not in body:
        return _error("ids and target are required")
    try:
        moved = service.move_tasks([int(identifier) for identifier in body["ids"]], body["target"], body.get("source"))
    except (ValueError, KeyError) as error:
        return _error(str(error))
    return JsonResponse({"tasks": [service._task_json(task) for task in moved]})


@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def task_detail(request, task_id):
    service = WebService()
    if request.method == "DELETE":
        try:
            service.delete_task(task_id, request.GET.get("list"))
        except KeyError:
            return _error("task not found", 404)
        return JsonResponse({"deleted": True})
    body = _body(request)
    if body is None:
        return _error("invalid JSON")
    try:
        task = service.update_task(task_id, body, request.GET.get("list"))
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


@require_http_methods(["GET"])
def time_tags(request):
    return JsonResponse({"tags": WebService().time_tags()})


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


@require_http_methods(["GET"])
def spending_tags(request):
    return JsonResponse({"tags": WebService().spending_tags()})


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
