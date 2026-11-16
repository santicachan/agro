import { PartyDetailPage } from "@/components/crm/party-pages";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const [{ id }, { editar }] = await Promise.all([params, searchParams]);
  return <PartyDetailPage kind="supplier" id={id} edit={editar === "1"} />;
}
