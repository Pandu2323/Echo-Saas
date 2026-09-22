import { SentraCodeApp } from "@/components/sentracode/sentra-app";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "SentraCode — AI Security Review" };

export default function SentraCodePage() {
  return (
    <div className="h-full overflow-hidden">
      <SentraCodeApp />
    </div>
  );
}