#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate

python manage.py shell <<'PYEOF'
from django.contrib.auth import get_user_model

User = get_user_model()
if not User.objects.filter(username="admin").exists():
    User.objects.create_superuser("admin", "luisangel2235@gmail.com", "Universo11*")
PYEOF
