from django.urls import path

from jasem_web import views

urlpatterns = [
    path("api/health/", views.health),
    path("api/dashboard/", views.dashboard),
    path("api/tasks/", views.tasks),
    path("api/tasks/<int:task_id>/", views.task_detail),
    path("api/time/", views.time_entries),
    path("api/spending/", views.spending),
]

