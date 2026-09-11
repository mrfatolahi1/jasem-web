import "./globals.css";

export const metadata = {
  title: "jasem — plain-text life admin",
  description: "A local web companion for jasem.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}

