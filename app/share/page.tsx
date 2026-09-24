import DistanceApp from "../page";
import { shareMetadata } from "@/lib/share-metadata";

// Same application, no redirect. A stable new URL for a fresh card fetch.
export const metadata = shareMetadata("/share");

export default function SharePage() {
  return <DistanceApp />;
}
