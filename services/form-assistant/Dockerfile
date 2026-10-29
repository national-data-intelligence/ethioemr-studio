FROM python:3.12-slim
# node runs the command-line form Check (check-form.js, mounted at /srv/check-form) for /v1/forms/draft
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node
RUN pip install --no-cache-dir "fastapi==0.115.*" "uvicorn[standard]==0.32.*" "httpx==0.27.*" "fastembed==0.9.*" numpy
WORKDIR /srv/app
COPY retrieval.py server.py drafting.py ./
EXPOSE 8768
CMD ["python", "server.py"]
