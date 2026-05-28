FROM python:3.12-slim

WORKDIR /app

COPY analytics_dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY analytics_dashboard/app ./app
COPY analytics_dashboard/static ./static

ENV ESHOP_DB_PATH=/data/eshop.sqlite

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
