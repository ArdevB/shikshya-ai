# The AI service. Build from this folder:
#   docker build -t shikshya-ai apps/ai

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY ml ./ml
COPY timetable ./timetable
# Trained here, so the saved model always matches the scikit-learn version in this image. The data
# and the random seed are fixed, so it comes out the same each time.
RUN python -m ml.train
USER nobody
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
