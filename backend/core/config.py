from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str = ""
    backend_port: int = 8000
    frontend_origin: str = "http://localhost:5173"

    model_config = {"env_file": "../.env"}

    @property
    def demo_mode(self) -> bool:
        return not self.gemini_api_key or self.gemini_api_key == "demo"


settings = Settings()
