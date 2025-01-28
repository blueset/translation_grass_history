import Fuse from "fuse.js"
import fs from "node:fs"
import { load } from "cheerio"

const messages = JSON.parse(fs.readFileSync('messages.json', 'utf8'))
messages.forEach((message) => {
  const $ = load(message.text)
  message.plainText = $('body').text()
})

const myIndex = Fuse.createIndex(["plainText", "media", "ocr"], messages)
fs.writeFileSync('messages.json', JSON.stringify(messages))
fs.writeFileSync('fuse-index.json', JSON.stringify(myIndex.toJSON()))
