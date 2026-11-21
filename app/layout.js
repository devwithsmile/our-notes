import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/lora/400-italic.css";
import "./globals.css";
export const metadata = {
  title: "Our Notes — A little space for us",
  description:
    "A shared notebook for everyday thoughts, plans, and memories. Open to read, written by people you trust.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
