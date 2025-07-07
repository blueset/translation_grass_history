import { useState, useMemo, useEffect, useRef, forwardRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse, { FuseResultMatch } from "fuse.js";
import { Input } from "@/components/ui/input";
import { Card, CardDescription } from "./components/ui/card";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Button } from "./components/ui/button";
import { CircleHelpIcon } from "lucide-react";
import { useTextHighlight, supportsHighlightAPI } from "./lib/utils";

// Convert FuseResultMatch to the format our highlight utility expects
const convertMatchesToHighlights = (matches?: FuseResultMatch[]) => {
  if (!matches?.length) return [];
  
  return matches
    .map((match) =>
      match.indices.map(([start, end]) => ({
        start,
        end,
      }))
    )
    .flat();
};

// Fallback highlighting for browsers that don't support CSS Custom Highlight API
const highlightTextFallback = (text: string, matches?: FuseResultMatch[]) => {
  if (!matches?.length) return text;
  const parts = [];
  let lastIndex = 0;
  matches.forEach((match) => {
    match.indices.forEach(([start, end]) => {
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }
      parts.push(
        `<mark class="bg-yellow-300 text-primary-foreground rounded-sm px-1">${text.slice(start, end + 1)}</mark>`
      );
      lastIndex = end + 1;
    });
  });
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.join('');
};

const highlightTextNodeFallback = (text: string, matches?: FuseResultMatch[]) => {
  if (!matches?.length) return text;
  const parts = [];
  let lastIndex = 0;
  matches.forEach((match) => {
    match.indices.forEach(([start, end]) => {
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }
      parts.push(
        <mark
          className="bg-yellow-300 text-primary-foreground rounded-sm px-1"
          key={start}
        >
          {text.slice(start, end + 1)}
        </mark>
      );
      lastIndex = end + 1;
    });
  });
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
};

interface Message {
  id: number;
  text: string;
  media?: string;
  ocr?: string;
}

const MessageItem = forwardRef<
  HTMLDivElement,
  {
    message: Message & { matches?: readonly FuseResultMatch[] };
    searchTerm: string;
    fuse: Fuse<Message>;
    index: number;
    onImageClick: (imagePath: string) => void;
  }
>(({ message, onImageClick, index }, ref) => {
  const textRef = useRef<HTMLDivElement>(null);
  const ocrRef = useRef<HTMLDivElement>(null);
  const [fallbackHighlightedText, setFallbackHighlightedText] = useState<string>(message.text);

  // Get matches for main text and OCR
  const textMatches = message.matches?.filter((match) => match.key === "plainText");
  const ocrMatches = message.matches?.filter((match) => match.key === "ocr");

  // Convert matches to highlight format
  const textHighlights = convertMatchesToHighlights(textMatches);
  const ocrHighlights = convertMatchesToHighlights(ocrMatches);

  // Use CSS Custom Highlight API for supported browsers
  useTextHighlight(textRef, textHighlights, `message-${message.id}-text`);
  useTextHighlight(ocrRef, ocrHighlights, `message-${message.id}-ocr`);

  // Fallback for browsers that don't support the API
  useEffect(() => {
    if (!supportsHighlightAPI()) {
      setFallbackHighlightedText(highlightTextFallback(message.text, textMatches));
    } else {
      setFallbackHighlightedText(message.text);
    }
  }, [message.text, textMatches]);

  return (
    <Card
      className={`p-6 border-b border-border transition-colors overflow-x-hidden mb-2 mr-2`}
      ref={ref}
      data-index={index}
    >
      <div className="flex flex-col md:flex-row gap-6">
        {message.media && (
          <div className="flex-shrink-0">
            <img
              src={`./images/${message.media}`}
              alt={message.ocr || message.text || "Media"}
              className="w-full md:w-48 h-48 object-cover rounded-lg shadow-md cursor-pointer"
              loading="lazy"
              decoding="async"
              onClick={() => onImageClick(`./images/${message.media}`)}
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
              ref={textRef}
              className="prose prose-sm dark:prose-invert max-w-none mb-3 whitespace-pre-wrap"
              dangerouslySetInnerHTML={
                supportsHighlightAPI()
                  ? { __html: message.text }
                  : { __html: fallbackHighlightedText }
              }
            />
          )}
          {message.ocr && (
            <div className="text-muted-foreground text-xs border-t border-border pt-3 mt-3">
              <div className="text-muted-foreground/80 mb-1">OCR Text:</div>
              <div ref={ocrRef}>
                {supportsHighlightAPI()
                  ? message.ocr
                  : highlightTextNodeFallback(message.ocr, ocrMatches)
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
});

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
    (async () => {
      try {
        const response = await fetch("./messages.json");
        const data = await response.json();
        const filteredMessages = data
          .filter((msg: Message) => msg.text || msg.media || msg.ocr)
          .sort((a: Message, b: Message) => b.id - a.id);
        setMessages(filteredMessages);
        setLoading(false);
      } catch (error) {
        console.error("Error loading messages:", error);
        setLoading(false);
      }
    })();
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(messages, {
        keys: ["plainText", "media", "ocr"],
        includeScore: true,
        threshold: 0.3,
        ignoreLocation: true,
        useExtendedSearch: true,
        includeMatches: true,
      }),
    [messages]
  );

  const filteredMessages = useMemo(() => {
    if (!searchTerm) return messages;
    return fuse
      .search(searchTerm)
      .map((result): Message & { matches?: readonly FuseResultMatch[] } => ({
        ...result.item,
        matches: result.matches,
      }));
  }, [messages, searchTerm, fuse]);

  // const estimatedSizesRef = useRef([] as number[]);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: filteredMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    // estimateSize: (idx) => estimatedSizesRef.current[idx] || 200,
    // measureElement: (element, _entry, _instance) => {
    //   const height = element.getBoundingClientRect().height;
    //   estimatedSizesRef.current[parseInt(element.dataset.index ?? "")] = height;
    //   console.log("Measured height:", height, "for element:", element);
    //   return height;
    // },
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
        <div className="z-10 flex flex-row gap-2">
          <Input
            type="search"
            placeholder="Search messages…"
            className="flex-grow w-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button asChild variant="outline" size="icon">
            <a
              href="https://www.fusejs.io/examples.html#extended-search"
              target="_blank"
              rel="noopener"
              title="Advanced search"
            >
              <CircleHelpIcon />
            </a>
          </Button>
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
                  index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
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
