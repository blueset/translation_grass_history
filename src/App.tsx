import { useState, useMemo, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import { Input } from "@/components/ui/input";
import { Card, CardDescription } from "./components/ui/card";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

const highlightText = (text: string, searchTerm: string) => {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm})`, "gi");
  return text.replace(
    regex,
    '<mark class="bg-yellow-300 text-primary-foreground rounded-sm px-1">$1</mark>'
  );
};

const highlightTextNode = (text: string, searchTerm: string) => {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm})`, "gi");
  return text.split(regex).map((part, index) =>
    index % 2 === 0 ? part : <mark key={index} className="bg-yellow-300 text-primary-foreground rounded-sm px-1">{part}</mark>
  );
}

interface Message {
  id: number;
  text: string;
  media?: string;
  ocr?: string;
}

function MessageItem({
  message,
  searchTerm,
  onImageClick,
}: {
  message: Message;
  searchTerm: string;
  fuse: Fuse<Message>;
  ref?: React.Ref<HTMLDivElement>;
  onImageClick: (imagePath: string) => void;
}) {
  return (
    <Card
      className={`p-6 border-b border-border transition-colors overflow-x-hidden mb-2 mr-2`}
    >
      <div className="flex flex-col md:flex-row gap-6">
        {message.media && (
          <div className="flex-shrink-0">
            <img
              src={`/images/${message.media}`}
              alt={message.ocr || message.text || "Media"}
              className="w-full md:w-48 h-48 object-cover rounded-lg shadow-md cursor-pointer"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onClick={() => onImageClick(`/images/${message.media}`)}
            />
          </div>
        )}
        <div className="flex-grow min-w-0">
            <CardDescription>
              <a
                href={`https://t.me/TranslationGrass/${message.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className=" hover:underline "
              >
                #{message.id}
              </a>
            </CardDescription>
          {message.text && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none mb-3 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: highlightText(message.text, searchTerm),
              }}
            />
          )}
          {message.ocr && (
            <div className="text-muted-foreground text-xs border-t border-border pt-3 mt-3">
              <div className="text-muted-foreground/80 mb-1">
                OCR Text:
              </div>
              <div
              >{ highlightTextNode(message.ocr, searchTerm)}</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const handleImageClick = (imagePath: string) => {
    setLightboxImage(imagePath);
    setLightboxOpen(true);
  };

  useEffect(() => {
    fetch("/messages.json")
      .then((res) => res.json())
      .then((data) => {
        // Filter out messages with no content and sort by id in descending order
        const filteredMessages = data
          .filter((msg: Message) => msg.text || msg.media || msg.ocr)
          .sort((a: Message, b: Message) => b.id - a.id);
        setMessages(filteredMessages);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error loading messages:", error);
        setLoading(false);
      });
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(messages, {
        keys: ["text", "media", "ocr"],
        includeScore: true,
        threshold: 0.3,
        ignoreLocation: true,
        useExtendedSearch: true,
      }),
    [messages]
  );

  const filteredMessages = useMemo(() => {
    if (!searchTerm) return messages;
    return fuse.search(searchTerm).map((result) => result.item);
  }, [messages, searchTerm, fuse]);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: filteredMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  const items = rowVirtualizer.getVirtualItems();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-xl text-muted-foreground">Loading messages…</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background">
      <div className="max-w-3xl mx-auto flex flex-col h-full gap-2 pt-2">
        <div className="z-10">
          <Input
            type="search"
            placeholder="Search messages…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div ref={parentRef} className="overflow-y-scroll h-0 flex-grow">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${items[0]?.start ?? 0}px)`,
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <MessageItem
                  key={virtualRow.index}
                  message={filteredMessages[virtualRow.index]}
                  searchTerm={searchTerm}
                  fuse={fuse}
                  onImageClick={handleImageClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <Lightbox
        open={lightboxOpen}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
        }}
        close={() => setLightboxOpen(false)}
        slides={[{ src: lightboxImage }]}
      />
    </div>
  );
}

export default App;
