#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
echo "CLOUDINARY_CLOUD_NAME set: $([ -n "$CLOUDINARY_CLOUD_NAME" ] && echo yes || echo no)"
python manage.py collectstatic --no-input
python manage.py migrate

python manage.py shell <<'PYEOF'
import os
from django.contrib.auth import get_user_model

username = os.environ.get("ADMIN_USERNAME")
password = os.environ.get("ADMIN_PASSWORD")

if username and password:
    User = get_user_model()
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={"email": os.environ.get("ADMIN_EMAIL", "")},
    )
    user.email = os.environ.get("ADMIN_EMAIL", user.email)
    user.is_staff = True
    user.is_superuser = True
    user.set_password(password)
    user.save()
PYEOF
