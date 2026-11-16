/**
 * Blog posts as typed data (no MDX dependency). Each block renders as a heading,
 * paragraph, list or call-to-action. Add posts here; they appear in the index,
 * sitemap and get Article schema automatically.
 */
export type Block =
  | { h2: string }
  | { p: string }
  | { ul: string[] }
  | { cta: { href: string; label: string } };

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
  body: Block[];
}

export const POSTS: Post[] = [
  {
    slug: "precio-soja-hoy-rosario-como-leer-la-pizarra",
    title: "Precio de la soja hoy en Rosario: cómo leer la pizarra",
    description: "Qué significa el precio de pizarra de la Bolsa de Comercio de Rosario, por qué a veces dice S/C y cómo pasarlo a dólares y quintales.",
    date: "2026-11-16",
    keywords: ["precio soja hoy rosario", "pizarra rosario", "qué es precio pizarra", "soja S/C"],
    body: [
      { p: "Todos los días hábiles la Cámara Arbitral de Cereales de la Bolsa de Comercio de Rosario publica los precios de pizarra de soja, maíz, trigo, girasol y sorgo. Son la referencia más usada en Argentina para cerrar negocios de granos disponibles." },
      { h2: "Qué es exactamente el precio de pizarra" },
      { p: "Es un precio en pesos por tonelada para mercadería disponible (entrega inmediata), pago contado y puesta sobre camión en la zona de Rosario. La Cámara lo calcula a partir de los negocios efectivamente realizados en el recinto ese día." },
      { h2: "Por qué a veces aparece “S/C” y un precio estimado (E)" },
      { p: "Cuando no hubo operaciones suficientes para fijar un precio, la pizarra muestra S/C (sin cotización) y la Cámara publica un precio estimado. En AgroJC lo marcamos con la etiqueta “Estimado” para que no lo confundas con un precio operado." },
      { h2: "Cómo pasarlo a dólares y a quintales" },
      { ul: ["En dólares: se divide por el dólar divisa comprador del Banco Nación al cierre, que la Bolsa informa al pie de la pizarra.", "En quintales: un quintal son 100 kg, así que el precio por quintal es el precio por tonelada dividido 10.", "Para comparar con Chicago: 1 bushel de soja pesa 27,216 kg, o sea 36,74 bushels por tonelada."] },
      { cta: { href: "/precios/soja", label: "Ver el precio de la soja hoy" } },
      { h2: "Del precio de pizarra al precio en tu campo" },
      { p: "El precio de pizarra está puesto en Rosario. Para saber lo que cobrás en chacra tenés que restar flete, comisiones, sellados y, si corresponde, secado. Usá la calculadora de precio en chacra para hacer la cuenta en segundos." },
      { cta: { href: "/calculadoras/precio-en-chacra", label: "Calcular precio neto en chacra" } },
    ],
  },
  {
    slug: "como-calcular-margen-bruto-soja",
    title: "Cómo calcular el margen bruto de la soja (con ejemplo)",
    description: "Paso a paso para calcular el margen bruto por hectárea de soja y el rinde de indiferencia, con un ejemplo numérico y una calculadora gratis.",
    date: "2026-11-16",
    keywords: ["calculadora margen bruto soja", "margen bruto agrícola", "rinde de indiferencia soja"],
    body: [
      { p: "El margen bruto es la herramienta más simple para comparar actividades agrícolas: muestra cuánto queda por hectárea después de pagar los costos directos de producir y vender." },
      { h2: "La fórmula" },
      { ul: ["Ingreso bruto = rinde (t/ha) × precio (USD/t).", "Gastos de comercialización = % del ingreso (comisiones, sellados) + flete × toneladas.", "Ingreso neto = ingreso bruto − gastos de comercialización.", "Costos = costos directos (semilla, agroquímicos, fertilizantes, labores) + cosecha + arrendamiento.", "Margen bruto = ingreso neto − costos."] },
      { h2: "Ejemplo" },
      { p: "Con 35 qq/ha (3,5 t), precio de USD 340/t, 4% de gastos comerciales, flete de USD 22/t, cosecha del 7% y USD 280/ha de costos directos en campo propio: el ingreso bruto es USD 1.190, el neto USD 1.065,40, los costos USD 363,30 y el margen bruto queda en USD 702,10 por hectárea." },
      { h2: "El rinde de indiferencia" },
      { p: "Es el rinde mínimo que cubre los costos. Se calcula dividiendo los costos fijos por hectárea por el precio neto por tonelada (precio menos gastos proporcionales y flete). En el ejemplo es de unos 10 qq/ha: cualquier rinde por encima deja margen positivo." },
      { cta: { href: "/calculadoras/margen-bruto", label: "Abrir la calculadora de margen bruto" } },
    ],
  },
  {
    slug: "merma-por-humedad-formula-y-tabla",
    title: "Merma por humedad: fórmula, humedad base y ejemplo",
    description: "Cómo se calcula la merma por humedad y manipuleo al entregar soja, maíz, trigo o girasol, y cuánto te cuesta el secado.",
    date: "2026-11-16",
    keywords: ["merma por humedad", "tabla merma maíz", "humedad base soja", "merma por secado fórmula"],
    body: [
      { p: "Cuando el grano llega al acopio con más humedad que la base de comercialización, se descuentan kilos: el agua que se va a evaporar al secarlo más una pequeña merma por manipuleo." },
      { h2: "Humedades base en Argentina" },
      { ul: ["Soja: 13,5%", "Maíz: 14,5%", "Trigo: 14%", "Girasol: 11%", "Sorgo: 15%"] },
      { h2: "La fórmula" },
      { p: "Merma % = (humedad del grano − humedad base) ÷ (100 − humedad base) × 100, más la merma por manipuleo (en general 0,25% para soja y maíz). Las tablas oficiales de cada cámara pueden redondear distinto, pero el resultado es muy similar." },
      { h2: "Ejemplo con maíz" },
      { p: "30.000 kg de maíz al 17% de humedad: (17 − 14,5) ÷ 85,5 × 100 = 2,92%, más 0,25% de manipuleo = 3,17%. Se descuentan unos 952 kg y se liquidan 29.048 kg netos." },
      { cta: { href: "/calculadoras/merma-por-humedad", label: "Calcular merma por humedad" } },
    ],
  },
];

export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);
