/**
 * Blog posts as typed data (no MDX dependency). Each block renders as a heading,
 * paragraph, list or call-to-action. Add posts here; they appear in the index,
 * sitemap and get Article schema automatically.
 */
export type Block =
  | { h2: string }
  | { p: string }
  | { ul: string[] }
  | { cta: { href: string; label: string } }
  | { sources: { label: string; href: string }[] };

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
    slug: "mercado-de-granos-19-noviembre-2026-pizarra-rosario-matba-rofex",
    title: "Mercado de granos: pizarra de Rosario y futuros al 19 de noviembre de 2026",
    description: "Soja estable en $550.000, maíz y trigo en alza en la pizarra de Rosario; qué marcan los futuros de Matba-Rofex y por qué Chicago viene presionando.",
    date: "2026-11-19",
    keywords: ["precio soja hoy", "pizarra rosario 18 de noviembre", "precio maíz hoy", "precio trigo hoy", "matba rofex soja noviembre 2026"],
    body: [
      { p: "La última pizarra de la Cámara Arbitral de Cereales de la Bolsa de Comercio de Rosario (miércoles 18 de noviembre) dejó una soja firme, un maíz y un trigo que siguen recuperando terreno y dos cultivos —girasol y sorgo— sin operaciones suficientes, con precio estimado. Repasamos los números y qué mirar antes de vender." },
      { h2: "La pizarra del 18 de noviembre" },
      { ul: [
        "Soja: $550.000/t, sin cambios respecto del martes. Al dólar divisa comprador del Banco Nación ($1.550,50) equivale a unos USD 354,72/t.",
        "Maíz: $271.000/t, +0,9% frente a los $268.500 del día anterior (≈ USD 174,8/t).",
        "Trigo: $286.850/t, +0,5% frente a los $285.455 del martes (≈ USD 185/t).",
        "Girasol: S/C, con un precio estimado de $744.240/t.",
        "Sorgo: S/C, con un precio estimado de $279.090/t.",
      ] },
      { p: "Ojo con el tipo de cambio: entre el 17 y el 18 de noviembre el dólar de referencia pasó de unos $1.543 a $1.550,50. Con la soja quieta en pesos, eso implica que en dólares la oleaginosa perdió algunos centavos por tonelada, mientras que maíz y trigo subieron también medidos en dólares." },
      { cta: { href: "/precios", label: "Ver precios de granos actualizados" } },
      { h2: "Qué dicen los futuros de Matba-Rofex" },
      { p: "En el mercado de futuros, al cierre del 18 de noviembre la soja Rosario con entrega noviembre 2026 se negoció en torno a USD 356/t, el trigo Rosario noviembre 2026 alrededor de USD 191/t y el maíz Rosario diciembre 2026 cerca de USD 184/t." },
      { ul: [
        "Soja: el futuro cercano (USD 356) prácticamente coincide con el disponible convertido (≈ USD 355), así que el mercado no está pagando un premio relevante por esperar unas semanas.",
        "Trigo: el futuro de noviembre (USD 191) está unos USD 6 por encima del disponible convertido, una diferencia que conviene comparar con el costo de almacenaje y financiero antes de decidir si cubrir o vender ya.",
        "Maíz: el contrato de diciembre (USD 184) queda casi USD 9 arriba del disponible, en línea con un mercado que todavía espera mejor demanda hacia fin de año.",
      ] },
      { h2: "El contexto internacional" },
      { p: "Según el análisis semanal de la Bolsa de Comercio de Rosario, los precios en Chicago vienen presionados por un dólar fuerte a nivel global, la baja del petróleo y ventas de los fondos de inversión. A eso se suma la expectativa de una cosecha de trigo muy grande en Argentina: la BCR estima 24,3 millones de toneladas, una “súpercampaña” que suma oferta justo cuando arranca la trilla en la zona núcleo." },
      { h2: "Qué tener en cuenta para vender o cubrirse" },
      { ul: [
        "Calculá siempre el precio neto en chacra: a la pizarra hay que restarle flete, comisiones, sellados y, si corresponde, secado.",
        "Si tenés deudas en dólares (insumos, cuotas de maquinaria), compará el precio en pesos convertido al tipo de cambio del día del pago, no el de la factura.",
        "Un canje de granos por insumos o por una camioneta te permite fijar la relación de intercambio y cubrirte de la volatilidad del tipo de cambio.",
      ] },
      { cta: { href: "/calculadoras/precio-en-chacra", label: "Calcular precio neto en chacra" } },
      { p: "Los precios son de referencia y cambian todos los días; antes de cerrar un negocio confirmá la cotización con tu corredor o acopio." },
      { sources: [
        { label: "Cámara Arbitral de Cereales — Bolsa de Comercio de Rosario (pizarra diaria)", href: "https://www.cac.bcr.com.ar" },
        { label: "Cadena Láser: pizarra de granos Rosario, 18/11/2026", href: "https://www.cadenalaser.com/nota/pizarra-de-granos-rosario-2026-11-18" },
        { label: "Bolsa de Comercio de Rosario — informes y estimaciones", href: "https://www.bcr.com.ar" },
        { label: "Matba-Rofex — mercado de futuros agrícolas", href: "https://www.matbarofex.com.ar" },
      ] },
    ],
  },
  {
    slug: "clima-y-avance-de-campana-19-noviembre-2026",
    title: "Clima y campaña: lluvias, tormentas y avance de siembra y cosecha (19 de noviembre de 2026)",
    description: "Qué esperar del clima en la región pampeana para las próximas dos semanas, cómo vienen la siembra de soja y maíz y la cosecha de trigo, y los riesgos a vigilar.",
    date: "2026-11-19",
    keywords: ["pronóstico agroclimático noviembre 2026", "avance siembra soja", "cosecha de trigo 2026", "lluvias región pampeana", "alerta tormentas córdoba la pampa"],
    body: [
      { p: "Noviembre encuentra al campo argentino en plena siembra gruesa y con la trilla de trigo acelerándose. El clima de las próximas dos semanas va a ser clave: hay lluvias para buena parte de la región, pero también un riesgo de calor extremo hacia el norte y tormentas fuertes localizadas." },
      { h2: "Hoy: alerta por tormentas" },
      { p: "El Servicio Meteorológico Nacional advirtió por tormentas localmente fuertes para este jueves 19 de noviembre en el sur de Córdoba, San Luis y el noreste de La Pampa, con posibles ráfagas, caída de granizo y lluvias intensas en períodos cortos. Si tenés trigo listo para cosechar o labores pendientes en esas zonas, conviene seguir los avisos actualizados." },
      { h2: "Perspectiva agroclimática: 19 al 25 de noviembre" },
      { p: "Según la perspectiva semanal de la Bolsa de Cereales de Buenos Aires (elaborada por el Lic. Eduardo Sierra):" },
      { ul: [
        "Lluvias de entre 10 y 25 mm sobre el centro y el sudoeste de la región, con focos de más de 100 mm en el centro de La Pampa.",
        "El este de la región pampeana recibiría menos de 10 mm.",
        "Temperaturas máximas superiores a 30 °C en el norte y el oeste del área agrícola.",
      ] },
      { h2: "26 de noviembre al 2 de diciembre" },
      { ul: [
        "Precipitaciones de 10 a 75 mm sobre la mayor parte del área agrícola y focos de más de 100 mm en el sur de La Pampa.",
        "Al comienzo del período, riesgo de heladas en zonas del sur; luego, un fuerte ascenso térmico con máximas de hasta 45 °C en el norte del país.",
      ] },
      { cta: { href: "/calculadoras/densidad-de-siembra", label: "Calcular densidad de siembra" } },
      { h2: "Cómo viene la campaña" },
      { p: "El Panorama Agrícola Semanal de la Bolsa de Cereales de Buenos Aires con datos al 12 de noviembre muestra:" },
      { ul: [
        "Soja: 17,8% sembrado sobre una intención de 17 millones de hectáreas.",
        "Maíz: 51,2% sembrado sobre 8,4 millones de hectáreas, 14,6 puntos porcentuales por delante del año pasado.",
        "Trigo: 11,9% cosechado, con un rinde promedio de 22,2 qq/ha y una producción estimada en 23,4 millones de toneladas.",
        "Girasol: 83,4% sembrado.",
      ] },
      { p: "En el núcleo, la cosecha de trigo arrancaría entre 7 y 20 días. La Bolsa advierte que en esa zona hay riesgos por fusarium, heladas tardías y un bajo cociente fototermal durante el llenado de granos, factores que podrían recortar rindes respecto del potencial inicial. Por su parte, la Bolsa de Comercio de Rosario proyecta una producción de trigo de 24,3 millones de toneladas." },
      { h2: "Recomendaciones prácticas" },
      { ul: [
        "Trigo: priorizá la cosecha de lotes maduros antes de las ventanas de tormenta y controlá la humedad de recibo para evitar mermas.",
        "Soja y maíz: con lluvias desparejas, revisá la humedad del perfil antes de sembrar y ajustá densidades en los lotes más secos del este.",
        "Calor extremo en el norte: atención a los maíces tempranos en floración hacia fines de mes.",
      ] },
      { cta: { href: "/calculadoras/merma-por-humedad", label: "Calcular merma por humedad" } },
      { sources: [
        { label: "Servicio Meteorológico Nacional — alertas", href: "https://www.smn.gob.ar/alertas" },
        { label: "Ruralnet: alerta por tormentas en Córdoba, San Luis y La Pampa", href: "https://www.ruralnet.com.ar" },
        { label: "Bolsa de Cereales de Buenos Aires — Perspectiva agroclimática semanal", href: "https://www.bolsadecereales.com" },
        { label: "De Frente al Campo: informe agroclimático semanal de noviembre", href: "https://www.defrentealcampo.com.ar/informe-agroclimatico-semanal-noviembre" },
        { label: "Bolsa de Cereales de Buenos Aires — Panorama Agrícola Semanal", href: "https://www.bolsadecereales.com" },
        { label: "Campo a Pleno: avance de siembra y cosecha al 12/11/2026", href: "https://www.campoapleno.com.ar" },
        { label: "Bolsa de Comercio de Rosario — estimaciones", href: "https://www.bcr.com.ar" },
      ] },
    ],
  },
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
      { p: "Cuando no hubo operaciones suficientes para fijar un precio, la pizarra muestra S/C (sin cotización) y la Cámara publica un precio estimado. En CAMPAGROX lo marcamos con la etiqueta “Estimado” para que no lo confundas con un precio operado." },
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
