from fastapi import FastAPI

app = FastAPI(title="Dealer Portal Assistant")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
