import { Inter_Tight } from "next/font/google";
import "./pro.css";

// The Scope app's typeface, for /pro only.
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-inter-tight" });

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <div className={`pro-root ${interTight.variable}`}>{children}</div>;
}
