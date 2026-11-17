import { PartyDetailPage } from "@/components/crm/party-pages";

const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string; desde?: string; hasta?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <PartyDetailPage kind="customer" id={id} edit={sp.editar === "1"} range={{ from: isDate(sp.desde), to: isDate(sp.hasta) }} />;
}
