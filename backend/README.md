# Jasem Web backend

Install dependencies and run the local Django server:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 127.0.0.1:8000
```

The API uses jasem's configured files (`JASEM_DIR`, `JASEM_FILE`, and related
environment variables). It has no models, migrations, or database.

