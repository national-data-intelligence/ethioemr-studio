FROM python:3.12-slim
RUN pip install --no-cache-dir "fastapi==0.115.*" "uvicorn[standard]==0.32.*" "httpx==0.27.*"
WORKDIR /srv/app
COPY retrieval.py server.py ./
EXPOSE 8768
CMD ["python", "server.py"]
