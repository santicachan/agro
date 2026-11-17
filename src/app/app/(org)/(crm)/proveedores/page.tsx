import { PartyListPage } from "@/components/crm/party-pages";

export const metadata = { title: "Proveedores" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <PartyListPage kind="supplier" q={q} />;
}
