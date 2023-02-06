import time
from pyrogram import Client
from pyrogram.types import Message
import asyncio
import html
import json
import pathlib
import requests
import os

channel = "TranslationGrass"
path = "./images/"

api_id = os.environ["API_ID"]
api_hash = os.environ["API_HASH"]
session_string = os.environ["SESSION_STRING"]
subscription_key = os.environ["SUBSCRIPTION_KEY"]
endpoint = os.environ["ENDPOINT"]


def recognize_text(path: str) -> str:
    headers = {
        "Ocp-Apim-Subscription-Key": subscription_key,
        "Content-Type": "application/octet-stream"
    }
    with open(path, "rb") as image:
        image_data = image.read()
    
    response = None
    while not response or response.status_code > 299:
        response = requests.post(
            endpoint,
            headers=headers,
            data=image_data
        )

        if response.status_code > 299:
            if response.status_code == 429:
                duration = int(response.headers["Retry-After"])
                print("HTTP 429, waiting", duration + 1, "seconds")
                time.sleep(duration + 1)
                continue
            raise Exception(f"Failed to recognize texts in the image. API returned status code: {response.status_code}, {response.content}")
    
    result_url = response.headers["Operation-Location"]

    result = {"status": "notStarted"}
    while result["status"] in ("notStarted", "running"):
        response = requests.get(result_url, headers=headers)
        if response.status_code > 299:
            if response.status_code == 429:
                duration = int(response.headers["Retry-After"])
                print("HTTP 429, waiting", duration + 1, "seconds")
                time.sleep(duration + 1)
                continue
            raise Exception(f"Failed to recognize texts in the image. API returned status code: {response.status_code}, {response.content}")
        result = response.json()
    
    if result["status"] == "failed":
        raise Exception(f"Failed to recognize texts in the image. Response: {result}")
    
    lines = []
    for page in result["analyzeResult"]["readResults"]:
        for line in page["lines"]:
            lines.append(line["text"])
    
    return "\n".join(lines)

async def dump_message(app: Client, message: Message):
    outcome = {
        "id": message.id,
        "text": (message.text and message.text.html) or (message.caption and message.caption.html) or "",
    }

    media = None

    if message.photo:
        media = message.photo
    elif message.web_page:
        if message.web_page.site_name:
            outcome["text"] += f"\n{html.escape(message.web_page.site_name)}"
        if message.web_page.title:
            outcome["text"] += f"\n{html.escape(message.web_page.title)}"
        if message.web_page.description:
            outcome["text"] += f"\n{html.escape(message.web_page.description)}"
        media = message.web_page.photo

    if media:
        file_name = f"{message.id}-{media.file_unique_id}.jpg"
        p = pathlib.Path(path + file_name)
        if not p.exists():
            await app.download_media(media, file_name=path + file_name)
        outcome["media"] = file_name
        outcome["ocr"] = recognize_text(path + file_name)

    outcome["text"] = outcome["text"].strip()
    return outcome

async def dump_channel(app: Client):
    messages = []
    async for message in app.get_chat_history(channel):
        print(message.id)
        messages.append(await dump_message(app, message))
        messages.sort(key=lambda m: m["id"])
        with open("messages.json", "w") as f:
            json.dump(messages, f, ensure_ascii=False, indent=2)

async def dump_new_messages(app: Client):
    messages = []
    with open("messages.json", "r") as f:
        messages = json.load(f)
    last_id = messages[-1]["id"]
    count = 0
    async for message in app.get_chat_history(channel):
        if message.id <= last_id:
            break
        messages.append(await dump_message(app, message))
        messages.sort(key=lambda m: m["id"])
        with open("messages.json", "w") as f:
            json.dump(messages, f, ensure_ascii=False, indent=2)
        count += 1

    print(f"::set-output name=messagesAdded::{count}")

async def main():
    async with Client("eana", api_id, api_hash, session_string=session_string) as app:
        await dump_new_messages(app)

if __name__ == "__main__":
    asyncio.run(main())
    # data = json.load(open("messages.json"))
    # for d in data:
    #     if "media" in d and "ocr" not in d:
    #         d["ocr"] = recognize_text(path + d["media"])
    #         with open("messages.json", "w") as f:
    #             json.dump(data, f, ensure_ascii=False, indent=2)
    #         print(d["media"])