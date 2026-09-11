from django.urls import path

from jasem_web import views

urlpatterns = [
    path("api/health/", views.health),
    path("api/dashboard/", views.dashboard),
    path("api/tasks/lists/", views.task_lists),
    path("api/tasks/tags/", views.task_tags),
    path("api/tasks/find/", views.task_find),
    path("api/tasks/move/", views.task_move),
    path("api/tasks/", views.tasks),
    path("api/tasks/<int:task_id>/", views.task_detail),
    path("api/time/", views.time_entries),
    path("api/time/tags/", views.time_tags),
    path("api/time/<int:entry_id>/", views.time_detail),
    path("api/spending/", views.spending),
    path("api/spending/tags/", views.spending_tags),
    path("api/spending/<int:record_id>/", views.spending_detail),
]
