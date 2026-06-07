/**
 * 03_enrich_master_dishes.js
 * --------------------------
 * Añade recipe completa (ingredients + steps) + metadata premium a los 45
 * platos master de kitchendishes que tienen recipe.ingredients vacío.
 *
 * Usage:
 *   node --experimental-vm-modules 03_enrich_master_dishes.js          # dry-run
 *   node --experimental-vm-modules 03_enrich_master_dishes.js --apply  # commit
 */

import { MongoClient, ObjectId } from "mongodb";
import { resolveMongoUrl } from "../mongo-url.js";

const APPLY = process.argv.includes("--apply");
const NOW = new Date();

// ─── DISHES ───────────────────────────────────────────────────────────────────
// baseServings: 4 en todos salvo excepciones indicadas
const DISHES = [

  // ── 1 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b00cd8f59ac154727100fb",
    name: "Pollo al Horno",
    description: "Un clásico reconfortante con piel dorada y crujiente, jugoso en el interior gracias a una marinada de ajo, romero y limón. Las patatas se empapan de los jugos del pollo durante el asado, convirtiéndose en el acompañamiento perfecto.",
    prepTime: 15,
    cookTime: 55,
    difficulty: "Fácil",
    allergens: [],
    tags: ["horno", "pollo", "familiar", "clásico"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pollo", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 pollo entero (~1.5 kg)" } },
        { name: "Patata", quantity: { amount: 700, unit: "g", scalable: true, originalText: "700 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 5, unit: "dientes", scalable: true, originalText: "5 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Romero", quantity: { amount: 2, unit: "ramas", scalable: false, originalText: "2 ramas frescas" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Precalentar el horno",
          text: "Precalienta el horno a 200 °C con calor arriba y abajo. Mientras, pela y corta las patatas en gajos y la cebolla en cuartos.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Horno precalentando",
          ingredientRefs: [{ name: "Patata" }, { name: "Cebolla" }],
        },
        {
          order: 2, title: "Preparar la bandeja",
          text: "Extiende los gajos de patata y la cebolla en la bandeja del horno. Riega con 2 cdas de aceite de oliva, añade sal, pimienta y el romero. Mezcla bien.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Patata" }, { name: "Cebolla" }, { name: "Aceite de oliva" }, { name: "Romero" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Condimentar el pollo",
          text: "Machaca los ajos con sal y mezcla con 1 cda de aceite y el zumo de medio limón. Frota el pollo por dentro y por fuera con esta mezcla. Colócalo sobre las patatas con la pechuga hacia arriba.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pollo" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Limón" }],
        },
        {
          order: 4, title: "Asar el pollo",
          text: "Hornea a 200 °C durante 50–55 minutos. A mitad de cocción, riega el pollo con sus propios jugos. El pollo está listo cuando al pinchar el muslo el jugo sale claro.",
          hasTimer: true, durationSeconds: 3300, timerLabel: "Asado",
          ingredientRefs: [{ name: "Pollo" }],
        },
        {
          order: 5, title: "Reposar y servir",
          text: "Saca el pollo del horno, cúbrelo con papel de aluminio y deja reposar 5 minutos antes de trinchar. Sirve con las patatas y exprime el limón restante por encima.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Reposo",
          ingredientRefs: [{ name: "Limón" }],
        },
      ],
    },
  },

  // ── 2 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b00cd8f59ac15472710101",
    name: "Pasta Boloñesa",
    description: "Ragú de carne lento y perfumado con tomate, ajo y hierbas mediterráneas que envuelve cada espiral de pasta con una salsa densa y reconfortante. Un plato que mejora con el tiempo y es favorito absoluto de toda la familia.",
    prepTime: 10,
    cookTime: 40,
    difficulty: "Fácil",
    allergens: ["gluten"],
    tags: ["pasta", "carne", "familiar", "italiano"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pasta", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g" } },
        { name: "Carne picada", quantity: { amount: 500, unit: "g", scalable: true, originalText: "500 g mixta" } },
        { name: "Tomate triturado", quantity: { amount: 400, unit: "g", scalable: true, originalText: "1 bote 400 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Orégano", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofreír la base",
          text: "Pica la cebolla y el ajo finamente. Calienta el aceite a fuego medio en una sartén amplia y sofríe la cebolla 5 minutos hasta que esté transparente. Añade el ajo y cocina 1 minuto más.",
          hasTimer: true, durationSeconds: 360, timerLabel: "Sofrito base",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Aceite de oliva" }],
        },
        {
          order: 2, title: "Dorar la carne",
          text: "Sube el fuego a medio-alto y añade la carne picada. Rompe los grumos con una cuchara de madera y cocina hasta que pierda el color rosado, unos 8 minutos. Salpimienta.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Dorar carne",
          ingredientRefs: [{ name: "Carne picada" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Añadir el tomate y cocer",
          text: "Incorpora el tomate triturado y el orégano. Remueve, baja el fuego al mínimo y cocina a fuego lento 25 minutos removiendo de vez en cuando hasta obtener una salsa espesa y perfumada.",
          hasTimer: true, durationSeconds: 1500, timerLabel: "Cocción ragú",
          ingredientRefs: [{ name: "Tomate triturado" }, { name: "Orégano" }],
        },
        {
          order: 4, title: "Cocer la pasta",
          text: "En una olla con abundante agua hirviendo y sal generosa, cuece la pasta según las instrucciones del paquete hasta que esté al dente. Reserva 1 vaso del agua de cocción antes de escurrir.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción pasta",
          ingredientRefs: [{ name: "Pasta" }, { name: "Sal" }],
        },
        {
          order: 5, title: "Mezclar y servir",
          text: "Añade la pasta escurrida a la sartén con el ragú. Mezcla a fuego bajo 1 minuto, añadiendo un poco del agua de cocción si la salsa espesa demasiado. Sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pasta" }],
        },
      ],
    },
  },

  // ── 3 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b00cd8f59ac15472710104",
    name: "Arroz con Verduras",
    description: "Arroz meloso y colorido salteado con pimiento, calabacín y dados de pollo tierno, todo perfumado con caldo casero. Una receta completa, equilibrada y lista en menos de 30 minutos.",
    prepTime: 15,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: [],
    tags: ["arroz", "verduras", "saludable", "completo"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Arroz", quantity: { amount: 320, unit: "g", scalable: true, originalText: "320 g" } },
        { name: "Pollo", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g en dados" } },
        { name: "Pimiento", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud rojo" } },
        { name: "Calabacín", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Caldo", quantity: { amount: 700, unit: "ml", scalable: true, originalText: "700 ml caldo de pollo" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimentón", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "1/2 cdta dulce" } },
      ],
      steps: [
        {
          order: 1, title: "Saltear el pollo",
          text: "Corta el pollo en dados de 2 cm y salpimienta. Calienta el aceite en una cazuela ancha a fuego vivo y dora el pollo 3–4 minutos. Retira y reserva.",
          hasTimer: true, durationSeconds: 240, timerLabel: "Dorar pollo",
          ingredientRefs: [{ name: "Pollo" }, { name: "Aceite de oliva" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Pochar las verduras",
          text: "En la misma cazuela baja el fuego a medio. Sofríe la cebolla picada 3 minutos, añade el pimiento en tiras y el calabacín en medias lunas. Cocina 5 minutos removiendo hasta que se ablanden. Añade el pimentón y remueve 30 segundos.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Pochado verduras",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Pimiento" }, { name: "Calabacín" }, { name: "Pimentón" }],
        },
        {
          order: 3, title: "Añadir el arroz y el caldo",
          text: "Incorpora el arroz y remueve 1 minuto para nacarar. Vuelve a poner el pollo reservado, vierte el caldo caliente, rectifica de sal y lleva a ebullición.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Arroz" }, { name: "Pollo" }, { name: "Caldo" }, { name: "Sal" }],
        },
        {
          order: 4, title: "Cocer el arroz",
          text: "Baja el fuego a medio-bajo, tapa y cocina 18 minutos sin destapar. Pasado ese tiempo apaga el fuego y deja reposar 5 minutos con la tapa puesta.",
          hasTimer: true, durationSeconds: 1080, timerLabel: "Cocción arroz",
          ingredientRefs: [{ name: "Arroz" }],
        },
      ],
    },
  },

  // ── 4 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa2",
    name: "Cuscús con Pollo y Verduras",
    description: "Inspirado en la cocina del Magreb, este cuscús aromático con dados de pollo y verduras de temporada se cocina en tan solo 20 minutos. El toque de comino y cúrcuma lo eleva a plato de restaurante.",
    prepTime: 20,
    cookTime: 20,
    difficulty: "Fácil",
    allergens: ["gluten"],
    tags: ["cuscús", "pollo", "norteafricano", "rápido"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Cuscús", quantity: { amount: 320, unit: "g", scalable: true, originalText: "320 g" } },
        { name: "Pollo", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g pechuga en dados" } },
        { name: "Zanahoria", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud" } },
        { name: "Calabacín", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Caldo", quantity: { amount: 350, unit: "ml", scalable: true, originalText: "350 ml caldo de pollo" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Comino", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Saltear el pollo",
          text: "Salpimienta el pollo. Calienta 2 cdas de aceite en una sartén grande a fuego vivo y dora los dados de pollo 5 minutos por todos los lados. Reserva.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Dorar pollo",
          ingredientRefs: [{ name: "Pollo" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Pochar las verduras",
          text: "En la misma sartén añade 1 cda de aceite. Sofríe la cebolla picada 3 minutos. Añade la zanahoria en rodajas y el calabacín en dados. Incorpora el comino y cocina 7 minutos a fuego medio.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Pochado verduras",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Zanahoria" }, { name: "Calabacín" }, { name: "Comino" }],
        },
        {
          order: 3, title: "Hidratar el cuscús",
          text: "Lleva el caldo a ebullición en un cazo. Vierte el cuscús en un bol amplio, añade el caldo hirviendo, tapa con un plato y deja reposar exactamente 5 minutos.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Reposo cuscús",
          ingredientRefs: [{ name: "Cuscús" }, { name: "Caldo" }],
        },
        {
          order: 4, title: "Montar el plato",
          text: "Esponja el cuscús con un tenedor. Vuelve a poner el pollo en la sartén con las verduras, mezcla 1 minuto a fuego medio y sirve sobre el cuscús.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pollo" }],
        },
      ],
    },
  },

  // ── 5 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa9",
    name: "Salchichas con Puré",
    description: "Clásico comfort food que nunca falla: salchichas doradas y crujientes por fuera, acompañadas de un puré de patata cremoso y mantecoso. Listo en 20 minutos y siempre un éxito.",
    prepTime: 5,
    cookTime: 20,
    difficulty: "Fácil",
    allergens: ["gluten", "lacteo"],
    tags: ["salchichas", "puré", "rápido", "familiar"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Salchichas", quantity: { amount: 8, unit: "ud", scalable: true, originalText: "8 ud" } },
        { name: "Puré de patatas", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g (preparado de sobre o casero)" } },
        { name: "Leche", quantity: { amount: 150, unit: "ml", scalable: true, originalText: "150 ml" } },
        { name: "Mantequilla", quantity: { amount: 30, unit: "g", scalable: true, originalText: "30 g" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar el puré",
          text: "Calienta la leche con la mantequilla en un cazo hasta que esta se derrita. Si usas sobre, sigue las instrucciones añadiendo esta mezcla. Si es casero, aplasta las patatas cocidas con la leche y la mantequilla. Salpimienta.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Puré de patatas" }, { name: "Leche" }, { name: "Mantequilla" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Dorar las salchichas",
          text: "Pincha las salchichas con un tenedor. Calienta una sartén sin aceite a fuego medio y cocina las salchichas girándolas cada 3 minutos hasta que estén doradas por todos lados, unos 12 minutos en total.",
          hasTimer: true, durationSeconds: 720, timerLabel: "Dorar salchichas",
          ingredientRefs: [{ name: "Salchichas" }],
        },
        {
          order: 3, title: "Servir",
          text: "Coloca una cama generosa de puré en cada plato y dispón las salchichas encima. Sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 6 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aae",
    name: "Quesadillas de Jamón y Queso",
    description: "Tortillas de trigo crujientes con un corazón fundido de queso y jamón cocido, doradas en la sartén sin aceite. Perfectas como cena rápida o aperitivo, listas en 10 minutos.",
    prepTime: 5,
    cookTime: 10,
    difficulty: "Fácil",
    allergens: ["gluten", "lacteo"],
    tags: ["quesadilla", "rápido", "mexicano", "queso"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Tortillas", quantity: { amount: 8, unit: "ud", scalable: true, originalText: "8 tortillas de trigo" } },
        { name: "Jamón cocido", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g en lonchas" } },
        { name: "Queso en Lonchas", quantity: { amount: 8, unit: "lonchas", scalable: true, originalText: "8 lonchas" } },
      ],
      steps: [
        {
          order: 1, title: "Montar las quesadillas",
          text: "Extiende una tortilla en la sartén fría. Cubre la mitad con 2 lonchas de jamón y 2 de queso. Dobla la tortilla por la mitad.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Tortillas" }, { name: "Jamón cocido" }, { name: "Queso en Lonchas" }],
        },
        {
          order: 2, title: "Dorar",
          text: "Calienta la sartén a fuego medio-alto sin aceite. Cocina la quesadilla 2 minutos por cada lado hasta que esté dorada y el queso fundido. Repite con el resto.",
          hasTimer: true, durationSeconds: 240, timerLabel: "Por quesadilla",
          ingredientRefs: [{ name: "Tortillas" }],
        },
        {
          order: 3, title: "Cortar y servir",
          text: "Corta cada quesadilla en 3 triángulos con un cuchillo o tijeras de cocina. Sirve inmediatamente mientras el queso esté fundido.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 7 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a8f",
    name: "Salchichas",
    description: "Salchichas doradas a la sartén con piel crujiente y jugosas por dentro. Una cena sencilla y rápida que nunca falla, perfecta con mostaza, kétchup o como acompañamiento.",
    prepTime: 2,
    cookTime: 12,
    difficulty: "Fácil",
    allergens: ["gluten"],
    tags: ["salchichas", "rápido", "fácil"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Salchichas", quantity: { amount: 8, unit: "ud", scalable: true, originalText: "8 ud" } },
        { name: "Mostaza", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "al gusto" } },
        { name: "Kétchup", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar las salchichas",
          text: "Pincha cada salchicha 3–4 veces con un tenedor para evitar que revienten durante la cocción.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Salchichas" }],
        },
        {
          order: 2, title: "Dorar en sartén",
          text: "Calienta una sartén antiadherente a fuego medio sin aceite. Cocina las salchichas girándolas cada 2–3 minutos durante 12 minutos en total, hasta que estén uniformemente doradas.",
          hasTimer: true, durationSeconds: 720, timerLabel: "Dorar salchichas",
          ingredientRefs: [{ name: "Salchichas" }],
        },
        {
          order: 3, title: "Servir",
          text: "Sirve las salchichas calientes con mostaza y kétchup a un lado.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Mostaza" }, { name: "Kétchup" }],
        },
      ],
    },
  },

  // ── 8 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a90",
    name: "Tortilla Francesa",
    description: "La tortilla francesa perfecta: exterior liso y dorado, interior cremoso y ligeramente bavoso. Dominar esta técnica clásica de la cocina francesa es el secreto de los grandes chefs.",
    prepTime: 2,
    cookTime: 5,
    difficulty: "Fácil",
    allergens: ["huevo", "lacteo"],
    tags: ["huevos", "rápido", "desayuno", "clásico"],
    baseServings: 1,
    recipe: {
      ingredients: [
        { name: "Huevos", quantity: { amount: 3, unit: "ud", scalable: true, originalText: "3 ud por persona" } },
        { name: "Mantequilla", quantity: { amount: 10, unit: "g", scalable: true, originalText: "10 g" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "1 pizca" } },
        { name: "Pimienta", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "1 pizca" } },
      ],
      steps: [
        {
          order: 1, title: "Batir los huevos",
          text: "Casca los huevos en un bol. Añade la sal y la pimienta y bate enérgicamente con un tenedor hasta que la clara y la yema estén completamente integradas.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Huevos" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Calentar la sartén",
          text: "Calienta una sartén antiadherente de 20 cm a fuego medio-alto. Añade la mantequilla y espera a que espume y empiece a dorarse ligeramente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Mantequilla" }],
        },
        {
          order: 3, title: "Cuajar la tortilla",
          text: "Vierte el huevo batido de golpe. Con una espátula, mueve el huevo desde los bordes hacia el centro mientras sacudes la sartén. Cuando el centro esté casi cuajado pero aún brillante, dobla la tortilla por la mitad y desliza al plato.",
          hasTimer: true, durationSeconds: 90, timerLabel: "Cuajado",
          ingredientRefs: [{ name: "Huevos" }],
        },
      ],
    },
  },

  // ── 9 ───────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aac",
    name: "Pollo Asado con Patatas",
    description: "Muslos y contramuslos de pollo asados hasta conseguir una piel lacada y crujiente, sobre una cama de patatas que absorben todos los jugos del asado. Un plato de domingo que no requiere ninguna técnica complicada.",
    prepTime: 15,
    cookTime: 55,
    difficulty: "Fácil",
    allergens: [],
    tags: ["horno", "pollo", "patatas", "familiar"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pollo", quantity: { amount: 1.2, unit: "kg", scalable: true, originalText: "1.2 kg muslos y contramuslos" } },
        { name: "Patata", quantity: { amount: 800, unit: "g", scalable: true, originalText: "800 g" } },
        { name: "Ajo", quantity: { amount: 6, unit: "dientes", scalable: true, originalText: "6 dientes con piel" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Romero", quantity: { amount: 2, unit: "ramas", scalable: false, originalText: "2 ramas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Precalentar y preparar",
          text: "Precalienta el horno a 200 °C. Pela las patatas y córtalas en rodajas de 1 cm. Dispónlas en una fuente de horno, riégalas con 2 cdas de aceite, añade los ajos con piel aplastados y el romero. Salpimienta.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Horno precalentando",
          ingredientRefs: [{ name: "Patata" }, { name: "Ajo" }, { name: "Romero" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Preparar el pollo",
          text: "Seca el pollo con papel de cocina. Úntalo con 1 cda de aceite, sal y pimienta generosa. Colócalo sobre las patatas con la piel hacia arriba.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pollo" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Asar",
          text: "Hornea a 200 °C durante 50–55 minutos. A los 30 minutos, rocía el pollo con sus jugos. El pollo está listo cuando la piel está dorada y crujiente y el interior alcanza 75 °C.",
          hasTimer: true, durationSeconds: 3300, timerLabel: "Asado",
          ingredientRefs: [{ name: "Pollo" }],
        },
      ],
    },
  },

  // ── 10 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a88",
    name: "Pastel de Carne",
    description: "Suculento pastel de carne cubierto con un manto de puré de patata dorado al horno. El interior jugoso con tomate y especias contrasta perfectamente con la corteza cremosa de la cobertura.",
    prepTime: 20,
    cookTime: 45,
    difficulty: "Media",
    allergens: ["gluten", "huevo", "lacteo"],
    tags: ["carne", "horno", "comfort food", "familiar"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Carne picada", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g mixta" } },
        { name: "Tomate frito", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g" } },
        { name: "Puré de patatas", quantity: { amount: 500, unit: "g", scalable: true, originalText: "500 g preparado" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Huevos", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Leche", quantity: { amount: 100, unit: "ml", scalable: false, originalText: "100 ml" } },
        { name: "Mantequilla", quantity: { amount: 20, unit: "g", scalable: false, originalText: "20 g" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar el relleno",
          text: "Precalienta el horno a 190 °C. Sofríe la cebolla y el ajo picados en aceite 5 minutos. Añade la carne picada, sube el fuego y cocina 8 minutos removiendo. Incorpora el tomate frito, salpimienta y cocina 5 minutos más hasta obtener una mezcla espesa.",
          hasTimer: true, durationSeconds: 1080, timerLabel: "Relleno",
          ingredientRefs: [{ name: "Carne picada" }, { name: "Cebolla" }, { name: "Ajo" }, { name: "Tomate frito" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Preparar el puré",
          text: "Prepara el puré siguiendo las instrucciones con leche caliente y mantequilla. Debe quedar cremoso y sin grumos. Bate el huevo e incorpóralo al puré fuera del fuego.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Puré de patatas" }, { name: "Leche" }, { name: "Mantequilla" }, { name: "Huevos" }],
        },
        {
          order: 3, title: "Montar y hornear",
          text: "Vierte el relleno de carne en una fuente para horno. Cubre uniformemente con el puré usando una espátula o manga pastelera. Hornea a 190 °C durante 25–30 minutos hasta que la superficie esté dorada.",
          hasTimer: true, durationSeconds: 1680, timerLabel: "Horneado",
          ingredientRefs: [{ name: "Puré de patatas" }],
        },
      ],
    },
  },

  // ── 11 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a96",
    name: "Arroz a la Cubana",
    description: "El icónico arroz blanco esponjoso acompañado de huevo frito con bordes crujientes y tomate frito casero. Un plato humilde que el tiempo ha convertido en un clásico indiscutible de la cocina española.",
    prepTime: 5,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: ["huevo"],
    tags: ["arroz", "huevos", "clásico", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Arroz", quantity: { amount: 320, unit: "g", scalable: true, originalText: "320 g arroz blanco" } },
        { name: "Tomate frito", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g" } },
        { name: "Huevos", quantity: { amount: 4, unit: "ud", scalable: true, originalText: "4 ud (1 por persona)" } },
        { name: "Aceite de girasol", quantity: { amount: 100, unit: "ml", scalable: false, originalText: "abundante para freír" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Cocer el arroz",
          text: "Lleva a ebullición 700 ml de agua con sal. Añade el arroz, remueve una vez y cocina a fuego medio-bajo tapado durante 18 minutos. Apaga y deja reposar 5 minutos.",
          hasTimer: true, durationSeconds: 1080, timerLabel: "Cocción arroz",
          ingredientRefs: [{ name: "Arroz" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Calentar el tomate",
          text: "Calienta el tomate frito en un cazo pequeño a fuego suave, removiendo ocasionalmente. Rectifica de sal.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Calentar tomate",
          ingredientRefs: [{ name: "Tomate frito" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Freír los huevos",
          text: "Calienta abundante aceite de girasol en una sartén pequeña a fuego vivo. Cuando humee, casca el huevo con cuidado. Inclina la sartén y riega la clara con el aceite caliente para que se cuaje rápidamente con bordes crujientes. Retira con espumadera.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Huevos" }, { name: "Aceite de girasol" }],
        },
        {
          order: 4, title: "Emplatar",
          text: "Con un molde o bol, forma un timbal de arroz en cada plato. Rodéalo con el tomate caliente y corona con el huevo frito. Sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 12 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a97",
    name: "Arroz con Pollo",
    description: "Arroz dorado al azafrán con trozos de pollo tierno y verduras, cocinado en caldo para que cada grano absorba todo el sabor del guiso. Un plato completo que recuerda a los arroces de abuela.",
    prepTime: 15,
    cookTime: 35,
    difficulty: "Media",
    allergens: [],
    tags: ["arroz", "pollo", "cazuela", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Arroz", quantity: { amount: 320, unit: "g", scalable: true, originalText: "320 g" } },
        { name: "Pollo", quantity: { amount: 700, unit: "g", scalable: true, originalText: "700 g en trozos con hueso" } },
        { name: "Pimiento", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud rojo" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Caldo", quantity: { amount: 800, unit: "ml", scalable: true, originalText: "800 ml caldo de pollo caliente" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Azafrán", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "1 pizca" } },
        { name: "Pimentón", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta dulce" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Dorar el pollo",
          text: "Salpimienta el pollo. Calienta el aceite en una cazuela amplia a fuego vivo y dora el pollo por todos los lados, 8–10 minutos. Retira y reserva.",
          hasTimer: true, durationSeconds: 540, timerLabel: "Dorar pollo",
          ingredientRefs: [{ name: "Pollo" }, { name: "Aceite de oliva" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Hacer el sofrito",
          text: "En la misma cazuela, baja el fuego a medio. Sofríe la cebolla picada 5 minutos, añade el ajo y el pimiento en tiras y cocina 5 minutos más. Añade el pimentón, remueve 30 segundos y añade el azafrán.",
          hasTimer: true, durationSeconds: 630, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Pimiento" }, { name: "Pimentón" }, { name: "Azafrán" }],
        },
        {
          order: 3, title: "Añadir arroz y caldo",
          text: "Vuelve a colocar el pollo. Añade el arroz y remueve 1 minuto. Vierte el caldo caliente, lleva a ebullición y ajusta de sal.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Arroz" }, { name: "Caldo" }, { name: "Sal" }],
        },
        {
          order: 4, title: "Cocer tapado",
          text: "Baja el fuego a medio-bajo, tapa y cocina 20 minutos. Comprueba que el arroz ha absorbido el caldo. Deja reposar 5 minutos con el fuego apagado antes de servir.",
          hasTimer: true, durationSeconds: 1200, timerLabel: "Cocción",
          ingredientRefs: [{ name: "Arroz" }],
        },
      ],
    },
  },

  // ── 13 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a9b",
    name: "San Jacobos Caseros",
    description: "El san jacobo perfecto: lonchas de jamón cocido y queso fundido encerradas en un rebozado dorado y crujiente. Hacerlos en casa es muy sencillo y el resultado supera con creces cualquier versión industrial.",
    prepTime: 15,
    cookTime: 15,
    difficulty: "Media",
    allergens: ["gluten", "huevo", "lacteo"],
    tags: ["empanado", "jamón", "queso", "clásico"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Jamón cocido", quantity: { amount: 8, unit: "lonchas", scalable: true, originalText: "8 lonchas gruesas" } },
        { name: "Queso en Lonchas", quantity: { amount: 8, unit: "lonchas", scalable: true, originalText: "8 lonchas" } },
        { name: "Pan rallado", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g" } },
        { name: "Huevos", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud batidos" } },
        { name: "Harina de trigo", quantity: { amount: 50, unit: "g", scalable: false, originalText: "50 g" } },
        { name: "Aceite de girasol", quantity: { amount: 400, unit: "ml", scalable: false, originalText: "abundante para freír" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "1 pizca" } },
      ],
      steps: [
        {
          order: 1, title: "Montar los san jacobos",
          text: "Coloca una loncha de jamón, encima una de queso y cubre con otra loncha de jamón, formando un sándwich. Presiona bien los bordes para que el queso quede sellado.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Jamón cocido" }, { name: "Queso en Lonchas" }],
        },
        {
          order: 2, title: "Empanar",
          text: "Pasa cada san jacobo por harina (sacude el exceso), luego por huevo batido con sal y finalmente por pan rallado, presionando para que se adhiera bien. Para un rebozado más grueso repite el baño en huevo y pan rallado.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Harina de trigo" }, { name: "Huevos" }, { name: "Pan rallado" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Freír",
          text: "Calienta abundante aceite a 180 °C en una sartén honda. Fríe los san jacobos 3–4 minutos por cada lado hasta que estén uniformemente dorados. Escurre sobre papel de cocina.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Fritura",
          ingredientRefs: [{ name: "Aceite de girasol" }],
        },
      ],
    },
  },

  // ── 14 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa8",
    name: "Hamburguesa de Ternera",
    description: "Hamburguesa artesanal de ternera con un punto de cocción jugoso, queso fundido, lechuga crujiente y tomate fresco en un pan brioche tostado. La hamburguesa casera que supera a cualquier cadena.",
    prepTime: 5,
    cookTime: 10,
    difficulty: "Fácil",
    allergens: ["gluten", "lacteo"],
    tags: ["hamburguesa", "ternera", "americano", "rápido"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Hamburguesa de Ternera", quantity: { amount: 4, unit: "ud", scalable: true, originalText: "4 ud 150 g c/u" } },
        { name: "Pan Brioche", quantity: { amount: 4, unit: "ud", scalable: true, originalText: "4 ud" } },
        { name: "Queso en Lonchas", quantity: { amount: 4, unit: "lonchas", scalable: true, originalText: "4 lonchas" } },
        { name: "Lechuga", quantity: { amount: 4, unit: "hojas", scalable: true, originalText: "4 hojas" } },
        { name: "Tomate", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud en rodajas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar la carne",
          text: "Saca las hamburguesas de la nevera 10 minutos antes. Salpimienta generosamente por ambos lados justo antes de cocinar.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Hamburguesa de Ternera" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Cocinar la hamburguesa",
          text: "Calienta una sartén de hierro o plancha a fuego vivo. Cocina las hamburguesas 3 minutos por el primer lado sin moverlas. Gíralas, coloca el queso encima y cocina 2–3 minutos más para un punto medio-jugoso.",
          hasTimer: true, durationSeconds: 360, timerLabel: "Cocción",
          ingredientRefs: [{ name: "Hamburguesa de Ternera" }, { name: "Queso en Lonchas" }],
        },
        {
          order: 3, title: "Tostar el pan y montar",
          text: "Tuesta el pan brioche partido por la mitad en la misma plancha 1 minuto. Monta la hamburguesa: base, lechuga, tomate, hamburguesa con queso y tapa.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pan Brioche" }, { name: "Lechuga" }, { name: "Tomate" }],
        },
      ],
    },
  },

  // ── 15 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a9d",
    name: "Revuelto de Champiñones",
    description: "Huevos cremosos revueltos con champiñones salteados al ajo y perejil. Una receta sencilla que depende por completo de la técnica: huevos a fuego bajo para conseguir una textura suave, sedosa e irresistible.",
    prepTime: 5,
    cookTime: 10,
    difficulty: "Fácil",
    allergens: ["huevo"],
    tags: ["huevos", "champiñones", "rápido", "saludable"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Huevos", quantity: { amount: 8, unit: "ud", scalable: true, originalText: "8 ud (2 por persona)" } },
        { name: "Champiñones", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Saltear los champiñones",
          text: "Limpia los champiñones con un trapo húmedo y lamínalos. Calienta el aceite a fuego vivo en una sartén amplia. Añade los champiñones en una sola capa y no remuevas los primeros 2 minutos para que se doren. Añade el ajo laminado y saltea 3 minutos más. Salpimienta.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Saltear champiñones",
          ingredientRefs: [{ name: "Champiñones" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Batir los huevos",
          text: "Casca los huevos en un bol y bátelos ligeramente con un tenedor —no en exceso— añadiendo una pizca de sal.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Huevos" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Hacer el revuelto",
          text: "Baja el fuego al mínimo. Vierte los huevos batidos sobre los champiñones. Con una espátula de silicona, remueve lentamente desde los bordes hacia el centro en círculos amplios. Retira del fuego cuando aún estén ligeramente líquidos — el calor residual terminará la cocción.",
          hasTimer: true, durationSeconds: 120, timerLabel: "Revuelto",
          ingredientRefs: [{ name: "Huevos" }],
        },
      ],
    },
  },


  // ── 16 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a9e",
    name: "Judías Verdes con Patata y Jamón",
    description: "Un guiso de siempre que combina la frescura de las judías verdes con la sustancia de la patata y el punto salado del jamón. Cocinado lentamente para que los sabores se fundan en un caldo perfumado.",
    prepTime: 10,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: [],
    tags: ["verduras", "legumbres", "guiso", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Judías verdes", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g limpias" } },
        { name: "Patata", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g en dados" } },
        { name: "Jamón cocido", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g en tiras" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar las judías",
          text: "Limpia las judías verdes quitando los extremos y los hilos laterales. Córtalas en trozos de 5 cm. Pela y corta las patatas en dados de 2 cm.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Judías verdes" }, { name: "Patata" }],
        },
        {
          order: 2, title: "Sofreír el ajo y el jamón",
          text: "Calienta el aceite en una cazuela a fuego medio. Dora el ajo laminado 1 minuto. Añade las tiras de jamón y saltea 2 minutos hasta que estén ligeramente doradas.",
          hasTimer: true, durationSeconds: 180, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Ajo" }, { name: "Jamón cocido" }, { name: "Aceite de oliva" }],
        },
        {
          order: 3, title: "Cocer las verduras",
          text: "Incorpora las judías y las patatas a la cazuela. Cubre con agua hasta casi cubrirlas, añade sal y lleva a ebullición. Baja el fuego, tapa y cocina 20 minutos hasta que la patata esté tierna.",
          hasTimer: true, durationSeconds: 1200, timerLabel: "Cocción",
          ingredientRefs: [{ name: "Judías verdes" }, { name: "Patata" }, { name: "Sal" }],
        },
        {
          order: 4, title: "Rectificar y servir",
          text: "Prueba y rectifica de sal. Sirve el guiso con un chorrito de aceite de oliva en crudo por encima.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Aceite de oliva" }],
        },
      ],
    },
  },

  // ── 17 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a98",
    name: "Arroz Tres Delicias",
    description: "El clásico arroz frito de la cocina chino-española con guisantes, jamón y huevo revuelto, todo salteado a fuego vivo con un toque de salsa de soja. Listo en 15 minutos con arroz del día anterior.",
    prepTime: 10,
    cookTime: 15,
    difficulty: "Fácil",
    allergens: ["gluten", "huevo"],
    tags: ["arroz", "asiático", "rápido", "aprovechamiento"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Arroz", quantity: { amount: 320, unit: "g", scalable: true, originalText: "320 g cocido y frío (idealmente del día anterior)" } },
        { name: "Huevos", quantity: { amount: 3, unit: "ud", scalable: true, originalText: "3 ud" } },
        { name: "Jamón cocido", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g en daditos" } },
        { name: "Guisantes", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g (congelados está bien)" } },
        { name: "Aceite de girasol", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Salsa de soja", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Cocer los guisantes",
          text: "Si son congelados, escáldalos en agua hirviendo con sal 3 minutos y escurre. Si son de lata, solo escurre.",
          hasTimer: true, durationSeconds: 180, timerLabel: "Guisantes",
          ingredientRefs: [{ name: "Guisantes" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Revolver el huevo",
          text: "Calienta 1 cda de aceite en un wok o sartén grande a fuego vivo. Bate los huevos con una pizca de sal y cuájalos removiendo rápidamente para obtener un revuelto suelto. Retira y reserva.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Huevos" }, { name: "Aceite de girasol" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Saltear el arroz",
          text: "En el mismo wok a fuego máximo, añade 2 cdas de aceite. Incorpora el arroz frío y saltea 3 minutos sin parar de mover para que se suelte y se tueste ligeramente.",
          hasTimer: true, durationSeconds: 180, timerLabel: "Saltear arroz",
          ingredientRefs: [{ name: "Arroz" }, { name: "Aceite de girasol" }],
        },
        {
          order: 4, title: "Incorporar y terminar",
          text: "Añade el jamón, los guisantes y el huevo revuelto. Vierte la salsa de soja y saltea 2 minutos más a fuego vivo mezclando todo bien. Sirve inmediatamente.",
          hasTimer: true, durationSeconds: 120, timerLabel: "Mezcla final",
          ingredientRefs: [{ name: "Jamón cocido" }, { name: "Guisantes" }, { name: "Huevos" }, { name: "Salsa de soja" }],
        },
      ],
    },
  },

  // ── 18 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a9f",
    name: "Brócoli Gratinado",
    description: "Ramilletes de brócoli tiernos cubiertos con una bechamel ligera y una costra de queso gratinado dorada y burbujeante. Un acompañamiento elegante o plato vegetariano completo que convierte el brócoli en protagonista.",
    prepTime: 10,
    cookTime: 20,
    difficulty: "Fácil",
    allergens: ["lacteo"],
    tags: ["brócoli", "gratinado", "vegetariano", "horno"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Brócoli", quantity: { amount: 800, unit: "g", scalable: true, originalText: "800 g en ramilletes" } },
        { name: "Queso rallado", quantity: { amount: 100, unit: "g", scalable: true, originalText: "100 g (emmental o mezcla)" } },
        { name: "Mantequilla", quantity: { amount: 30, unit: "g", scalable: false, originalText: "30 g" } },
        { name: "Harina de trigo", quantity: { amount: 25, unit: "g", scalable: false, originalText: "25 g" } },
        { name: "Leche", quantity: { amount: 300, unit: "ml", scalable: false, originalText: "300 ml" } },
        { name: "Nuez moscada", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "1 pizca" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Cocer el brócoli",
          text: "Cuece los ramilletes en agua hirviendo con sal 5 minutos —deben quedar al dente—. Escurre bien y colócalos en una fuente para horno. Precalienta el gratinador a 200 °C.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Cocción brócoli",
          ingredientRefs: [{ name: "Brócoli" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Hacer la bechamel",
          text: "Derrite la mantequilla en un cazo a fuego medio. Añade la harina y remueve con varillas 1 minuto para cocinar el roux. Vierte la leche poco a poco sin parar de remover. Cocina 5 minutos hasta obtener una salsa cremosa. Salpimienta y añade la nuez moscada.",
          hasTimer: true, durationSeconds: 360, timerLabel: "Bechamel",
          ingredientRefs: [{ name: "Mantequilla" }, { name: "Harina de trigo" }, { name: "Leche" }, { name: "Nuez moscada" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Gratinar",
          text: "Vierte la bechamel sobre el brócoli y esparce el queso rallado por encima. Gratina en el horno 10 minutos hasta que la superficie esté dorada y burbujeante.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Gratinado",
          ingredientRefs: [{ name: "Queso rallado" }],
        },
      ],
    },
  },

  // ── 19 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a8c",
    name: "Salmón al Papillote",
    description: "Lomos de salmón cocinados en su propio vapor dentro de un sobre de papel de horno con puerro, zanahoria y eneldo. Una técnica infalible que conserva todos los jugos y aromas, y produce un pescado perfectamente húmedo.",
    prepTime: 10,
    cookTime: 20,
    difficulty: "Fácil",
    allergens: ["pescado"],
    tags: ["salmón", "horno", "saludable", "papillote"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Salmón", quantity: { amount: 4, unit: "lomos", scalable: true, originalText: "4 lomos 150 g c/u" } },
        { name: "Puerro", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud en juliana fina" } },
        { name: "Zanahoria", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud en juliana fina" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud en rodajas" } },
        { name: "Eneldo", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "eneldo fresco o seco al gusto" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Precalentar y preparar",
          text: "Precalienta el horno a 200 °C. Corta 4 rectángulos grandes de papel de horno. Reparte el puerro y la zanahoria en juliana en el centro de cada papel.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Horno precalentando",
          ingredientRefs: [{ name: "Puerro" }, { name: "Zanahoria" }],
        },
        {
          order: 2, title: "Montar el papillote",
          text: "Coloca un lomo de salmón sobre las verduras. Salpimienta, añade una rodaja de limón, espolvorea eneldo y riega con aceite de oliva. Cierra el papel haciendo pliegues herméticos para que no salga el vapor.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Salmón" }, { name: "Limón" }, { name: "Eneldo" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Hornear",
          text: "Coloca los papillotes en una bandeja y hornea a 200 °C durante 18–20 minutos. El papel se inflará: señal de que el vapor trabaja bien. Abre con cuidado al servir para evitar el vapor.",
          hasTimer: true, durationSeconds: 1080, timerLabel: "Horneado",
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 20 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a91",
    name: "Spaghetti Boloñesa",
    description: "Spaghetti largos y elásticos envueltos en un ragú de carne lento y perfumado, la versión italiana auténtica de un plato que ha conquistado el mundo. La clave: paciencia en la cocción y buena carne picada.",
    prepTime: 10,
    cookTime: 45,
    difficulty: "Fácil",
    allergens: ["gluten"],
    tags: ["pasta", "carne", "italiano", "familiar"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pasta", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g spaghetti" } },
        { name: "Carne picada", quantity: { amount: 500, unit: "g", scalable: true, originalText: "500 g mixta res y cerdo" } },
        { name: "Tomate frito", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Zanahoria", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud pequeña" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Orégano", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito de base",
          text: "Pica finamente la cebolla, el ajo y la zanahoria. Sofríe en aceite a fuego medio 8 minutos removiendo hasta que la cebolla esté dorada.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Zanahoria" }, { name: "Aceite de oliva" }],
        },
        {
          order: 2, title: "Dorar la carne",
          text: "Sube el fuego, añade la carne picada y rompe los grumos. Cocina 8 minutos hasta que se evapore el líquido y la carne se dore. Salpimienta.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Dorar carne",
          ingredientRefs: [{ name: "Carne picada" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Cocción lenta",
          text: "Añade el tomate frito y el orégano. Baja el fuego al mínimo y cocina 25 minutos tapado, removiendo cada 10 minutos. La salsa debe quedar espesa y brillante.",
          hasTimer: true, durationSeconds: 1500, timerLabel: "Cocción ragú",
          ingredientRefs: [{ name: "Tomate frito" }, { name: "Orégano" }],
        },
        {
          order: 4, title: "Cocer y servir",
          text: "Cuece la pasta en agua con sal abundante al dente. Escurre reservando un vaso de agua. Mezcla con el ragú añadiendo agua de cocción si es necesario. Sirve con queso rallado opcional.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción pasta",
          ingredientRefs: [{ name: "Pasta" }, { name: "Sal" }],
        },
      ],
    },
  },

  // ── 21 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a93",
    name: "Pasta Carbonara",
    description: "La auténtica carbonara romana: pasta al dente envuelta en una salsa sedosa de huevo y queso con dados de bacon crujiente. Sin nata, sin atajos: solo la emulsión perfecta que consiguen los maestros.",
    prepTime: 10,
    cookTime: 20,
    difficulty: "Media",
    allergens: ["gluten", "huevo", "lacteo"],
    tags: ["pasta", "italiano", "huevos", "clásico"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pasta", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g rigatoni o spaghetti" } },
        { name: "Bacon", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g en dados" } },
        { name: "Nata para cocinar", quantity: { amount: 100, unit: "ml", scalable: false, originalText: "100 ml (opcional, para versión más suave)" } },
        { name: "Queso rallado", quantity: { amount: 80, unit: "g", scalable: true, originalText: "80 g parmesano o pecorino" } },
        { name: "Huevos", quantity: { amount: 3, unit: "ud", scalable: true, originalText: "2 huevos enteros + 1 yema" } },
        { name: "Pimienta", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "pimienta negra recién molida abundante" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "para la pasta" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar la salsa",
          text: "En un bol, bate los huevos con el queso rallado, la nata y pimienta negra generosa. Reserva.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Huevos" }, { name: "Queso rallado" }, { name: "Nata para cocinar" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Dorar el bacon",
          text: "Calienta una sartén amplia sin aceite y dora el bacon a fuego medio-alto 5–6 minutos hasta que esté crujiente. Mantén el calor bajo al mínimo.",
          hasTimer: true, durationSeconds: 360, timerLabel: "Dorar bacon",
          ingredientRefs: [{ name: "Bacon" }],
        },
        {
          order: 3, title: "Cocer la pasta",
          text: "Cuece la pasta en agua hirviendo con sal abundante al dente según el paquete. Reserva 2 vasos grandes del agua de cocción antes de escurrir.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción pasta",
          ingredientRefs: [{ name: "Pasta" }, { name: "Sal" }],
        },
        {
          order: 4, title: "Emulsionar",
          text: "Fuera del fuego, añade la pasta escurrida a la sartén con el bacon. Vierte la mezcla de huevo y remueve rápidamente añadiendo agua de cocción cucharada a cucharada hasta obtener una salsa cremosa que cubra la pasta. El calor residual cocinará el huevo sin cuajarlo.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pasta" }, { name: "Huevos" }],
        },
      ],
    },
  },

  // ── 22 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aad",
    name: "Atún con Tomate",
    description: "Atún en aceite desmenuzado en una salsa de tomate casera con ajo y orégano. Un plato de despensa rápido, proteico y lleno de sabor mediterráneo que se hace en 15 minutos.",
    prepTime: 5,
    cookTime: 15,
    difficulty: "Fácil",
    allergens: ["pescado"],
    tags: ["atún", "tomate", "rápido", "despensa"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Atún en lata", quantity: { amount: 3, unit: "latas", scalable: true, originalText: "3 latas 80 g c/u en aceite" } },
        { name: "Tomate frito", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Orégano", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito",
          text: "Pica la cebolla y el ajo. Sofríe en aceite de oliva a fuego medio 7–8 minutos hasta que la cebolla esté dorada y blanda.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Aceite de oliva" }],
        },
        {
          order: 2, title: "Añadir el tomate",
          text: "Incorpora el tomate frito y el orégano. Cocina a fuego medio 5 minutos removiendo. Ajusta de sal.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Cocción tomate",
          ingredientRefs: [{ name: "Tomate frito" }, { name: "Orégano" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Añadir el atún y servir",
          text: "Escurre bien el atún y desmenúzalo sobre la salsa. Mezcla suavemente con una cuchara y calienta 2 minutos a fuego suave. Sirve solo o sobre arroz blanco o pasta.",
          hasTimer: true, durationSeconds: 120, timerLabel: "Calentar atún",
          ingredientRefs: [{ name: "Atún en lata" }],
        },
      ],
    },
  },

  // ── 23 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a9c",
    name: "Tortilla de Patata",
    description: "La tortilla española definitiva: patatas confitadas lentamente en aceite de oliva, mezcladas con cebolla pochada y huevos batidos, cuajada a fuego bajo hasta conseguir un interior jugoso y cremoso. El plato más icónico de España.",
    prepTime: 15,
    cookTime: 35,
    difficulty: "Media",
    allergens: ["huevo"],
    tags: ["huevos", "patatas", "español", "clásico"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Huevos", quantity: { amount: 6, unit: "ud", scalable: true, originalText: "6 ud grandes" } },
        { name: "Patata", quantity: { amount: 800, unit: "g", scalable: true, originalText: "800 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud grande" } },
        { name: "Aceite de oliva", quantity: { amount: 350, unit: "ml", scalable: false, originalText: "350 ml para confitar" } },
        { name: "Sal", quantity: { amount: 2, unit: "cdtas", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Confitar las patatas",
          text: "Pela y corta las patatas en láminas finas (3 mm) y la cebolla en juliana. Calienta el aceite a fuego medio-bajo (140 °C) y confita las patatas y la cebolla juntas 20–25 minutos, removiendo suavemente, hasta que estén muy tiernas pero sin dorar. Escurre con una espumadera reservando el aceite.",
          hasTimer: true, durationSeconds: 1500, timerLabel: "Confitar",
          ingredientRefs: [{ name: "Patata" }, { name: "Cebolla" }, { name: "Aceite de oliva" }],
        },
        {
          order: 2, title: "Mezclar con el huevo",
          text: "Bate los huevos en un bol grande con sal. Añade las patatas y la cebolla escurridas y calientes. Mezcla con cuidado y deja reposar 5 minutos para que el huevo empape bien.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Reposo mezcla",
          ingredientRefs: [{ name: "Huevos" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Cuajar la tortilla",
          text: "Calienta 2 cdas del aceite reservado en una sartén de 24 cm a fuego medio. Vierte la mezcla y cuaja 4 minutos sacudiendo la sartén. Da la vuelta con un plato y desliza de nuevo a la sartén. Cocina 3 minutos más para un interior cremoso.",
          hasTimer: true, durationSeconds: 420, timerLabel: "Cuajado",
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 24 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa0",
    name: "Coliflor Gratinada",
    description: "Coliflor tierna cubierta con una bechamel aterciopelada y una costra de queso dorada al gratinador. Una receta reconfortante que transforma la coliflor en un plato de categoría.",
    prepTime: 10,
    cookTime: 30,
    difficulty: "Fácil",
    allergens: ["lacteo", "gluten"],
    tags: ["coliflor", "gratinado", "vegetariano", "horno"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Coliflor", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud grande (~1 kg)" } },
        { name: "Queso rallado", quantity: { amount: 100, unit: "g", scalable: true, originalText: "100 g" } },
        { name: "Mantequilla", quantity: { amount: 30, unit: "g", scalable: false, originalText: "30 g" } },
        { name: "Harina de trigo", quantity: { amount: 25, unit: "g", scalable: false, originalText: "25 g" } },
        { name: "Leche", quantity: { amount: 350, unit: "ml", scalable: false, originalText: "350 ml" } },
        { name: "Nuez moscada", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "1 pizca" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Cocer la coliflor",
          text: "Divide la coliflor en ramilletes medianos. Cuécela en agua hirviendo salada 7–8 minutos hasta que esté tierna pero no deshecha. Escurre bien y coloca en una fuente para horno.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Cocción coliflor",
          ingredientRefs: [{ name: "Coliflor" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Bechamel",
          text: "Derrite la mantequilla a fuego medio. Añade la harina y cocina el roux 1 minuto. Vierte la leche tibia poco a poco batiendo con varillas. Cocina 5 minutos hasta que espese. Salpimienta con nuez moscada.",
          hasTimer: true, durationSeconds: 360, timerLabel: "Bechamel",
          ingredientRefs: [{ name: "Mantequilla" }, { name: "Harina de trigo" }, { name: "Leche" }, { name: "Nuez moscada" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 3, title: "Gratinar",
          text: "Vierte la bechamel sobre la coliflor. Esparce el queso rallado y gratina a 200 °C durante 12–15 minutos hasta que la superficie burbujee y esté dorada.",
          hasTimer: true, durationSeconds: 780, timerLabel: "Gratinado",
          ingredientRefs: [{ name: "Queso rallado" }],
        },
      ],
    },
  },

  // ── 25 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa3",
    name: "Merluza al Horno",
    description: "Lomos de merluza horneados sobre una cama de patatas y cebolla con ajo, perejil y un chorrito de vino blanco. Una receta ligera, saludable y sin complicaciones que pone el pescado en su mejor versión.",
    prepTime: 10,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: ["pescado"],
    tags: ["merluza", "horno", "saludable", "pescado"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Merluza", quantity: { amount: 4, unit: "lomos", scalable: true, originalText: "4 lomos 150 g c/u" } },
        { name: "Patata", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g en rodajas finas" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud en juliana" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes laminados" } },
        { name: "Aceite de oliva", quantity: { amount: 4, unit: "cdas", scalable: false, originalText: "4 cdas" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "zumo de 1 ud" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar la base",
          text: "Precalienta el horno a 200 °C. Extiende las rodajas de patata y la cebolla en juliana en una fuente para horno. Riega con 2 cdas de aceite, salpimienta y hornea 15 minutos para que se ablanden.",
          hasTimer: true, durationSeconds: 900, timerLabel: "Pre-cocción patatas",
          ingredientRefs: [{ name: "Patata" }, { name: "Cebolla" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Añadir el pescado",
          text: "Coloca los lomos de merluza sobre las patatas. Distribuye el ajo laminado por encima. Riega con el zumo de limón y 2 cdas de aceite. Salpimienta el pescado.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Merluza" }, { name: "Ajo" }, { name: "Limón" }, { name: "Aceite de oliva" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Hornear",
          text: "Hornea 10–12 minutos más. La merluza está lista cuando la carne se separa en lascas y pierde la transparencia. No sobre-cocines o quedará seca.",
          hasTimer: true, durationSeconds: 660, timerLabel: "Horneado pescado",
          ingredientRefs: [{ name: "Merluza" }],
        },
      ],
    },
  },

  // ── 26 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a95",
    name: "Ensalada de Pasta",
    description: "Pasta fría con atún, maíz dulce, tomate fresco y queso en una vinagreta ligera. Una ensalada completa, colorida y refrescante perfecta para llevar al trabajo o para los días calurosos.",
    prepTime: 15,
    cookTime: 10,
    difficulty: "Fácil",
    allergens: ["gluten", "pescado", "lacteo"],
    tags: ["pasta", "ensalada", "frío", "verano"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pasta", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g (fusilli o macarrones)" } },
        { name: "Atún en lata", quantity: { amount: 2, unit: "latas", scalable: true, originalText: "2 latas 80 g c/u" } },
        { name: "Maíz dulce en lata", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g escurrido" } },
        { name: "Tomate", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud en dados" } },
        { name: "Queso fresco", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g en dados" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Vinagre", quantity: { amount: 1, unit: "cda", scalable: false, originalText: "1 cda" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Orégano", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "1/2 cdta" } },
      ],
      steps: [
        {
          order: 1, title: "Cocer y enfriar la pasta",
          text: "Cuece la pasta en agua salada al dente. Escurre y enfría bajo el grifo de agua fría. Escurre bien y reserva en un bol grande.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción pasta",
          ingredientRefs: [{ name: "Pasta" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Preparar ingredientes",
          text: "Escurre el atún y el maíz. Corta el tomate y el queso en dados. Añade todo a la pasta.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Atún en lata" }, { name: "Maíz dulce en lata" }, { name: "Tomate" }, { name: "Queso fresco" }],
        },
        {
          order: 3, title: "Aliñar y servir",
          text: "Mezcla el aceite, el vinagre, la sal y el orégano en un vasito. Vierte sobre la ensalada y mezcla suavemente. Refrigera al menos 15 minutos antes de servir.",
          hasTimer: true, durationSeconds: 900, timerLabel: "Reposo en nevera",
          ingredientRefs: [{ name: "Aceite de oliva" }, { name: "Vinagre" }, { name: "Sal" }, { name: "Orégano" }],
        },
      ],
    },
  },

  // ── 27 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa7",
    name: "Pizza Refrigerada",
    description: "Pizza artesanal lista para hornear: base crujiente con todos los ingredientes en su punto perfecto, solo necesita el calor del horno para quedar dorada y con el queso fundido a la perfección.",
    prepTime: 2,
    cookTime: 15,
    difficulty: "Fácil",
    allergens: ["gluten", "lacteo"],
    tags: ["pizza", "rápido", "fácil"],
    baseServings: 2,
    recipe: {
      ingredients: [
        { name: "Pizza refrigerada", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
      ],
      steps: [
        {
          order: 1, title: "Precalentar el horno",
          text: "Precalienta el horno a la temperatura indicada en el envase (normalmente 200–220 °C) con calor arriba y abajo. Coloca la rejilla en la posición media-baja.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Horno precalentando",
          ingredientRefs: [],
        },
        {
          order: 2, title: "Hornear la pizza",
          text: "Retira el envase y coloca la pizza directamente sobre la rejilla del horno o en una bandeja. Hornea el tiempo indicado en el paquete (12–15 min) hasta que los bordes estén dorados y el queso burbujeante.",
          hasTimer: true, durationSeconds: 840, timerLabel: "Horneado",
          ingredientRefs: [{ name: "Pizza refrigerada" }],
        },
        {
          order: 3, title: "Reposar y servir",
          text: "Saca la pizza del horno y deja reposar 2 minutos antes de cortar. Usa una cortapizzas o cuchillo afilado para obtener porciones limpias.",
          hasTimer: true, durationSeconds: 120, timerLabel: "Reposo",
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 28 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a89",
    name: "Garbanzos con Chorizo",
    description: "Potaje clásico de garbanzos con chorizo ahumado en un caldo especiado con pimentón y laurel. Un plato de cuchara contundente y reconfortante que es tan fácil como abrir un bote y dejar que los sabores se fusionen.",
    prepTime: 5,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: [],
    tags: ["garbanzos", "chorizo", "cuchara", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Garbanzos", quantity: { amount: 800, unit: "g", scalable: true, originalText: "2 botes 400 g c/u cocidos" } },
        { name: "Chorizo", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g en rodajas" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Tomate triturado", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Pimentón", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta dulce ahumado" } },
        { name: "Laurel", quantity: { amount: 1, unit: "hoja", scalable: false, originalText: "1 hoja" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito",
          text: "Sofríe la cebolla y el ajo picados en aceite a fuego medio 5 minutos. Añade el pimentón, remueve 30 segundos y añade el tomate. Cocina 5 minutos.",
          hasTimer: true, durationSeconds: 630, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Pimentón" }, { name: "Tomate triturado" }],
        },
        {
          order: 2, title: "Añadir chorizo y garbanzos",
          text: "Incorpora el chorizo en rodajas y saltea 2 minutos. Añade los garbanzos escurridos y enjuagados, el laurel y cubre con 300 ml de agua o caldo.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Chorizo" }, { name: "Garbanzos" }, { name: "Laurel" }],
        },
        {
          order: 3, title: "Cocer y servir",
          text: "Lleva a ebullición, baja el fuego y cocina 15 minutos a fuego suave para que los sabores se integren. Ajusta de sal y retira el laurel. Sirve bien caliente.",
          hasTimer: true, durationSeconds: 900, timerLabel: "Cocción final",
          ingredientRefs: [{ name: "Sal" }],
        },
      ],
    },
  },

  // ── 29 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a8d",
    name: "Albóndigas",
    description: "Albóndigas jugosas de carne mixta en una salsa de tomate y zanahoria especiada. La receta de abuela que requiere paciencia para mezclar la carne con cariño y dejar que la salsa reduzca lentamente.",
    prepTime: 25,
    cookTime: 35,
    difficulty: "Media",
    allergens: ["gluten", "huevo"],
    tags: ["carne", "albóndigas", "salsa", "familiar"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Carne picada", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g mixta res y cerdo" } },
        { name: "Cebolla", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud (1 para carne, 1 para salsa)" } },
        { name: "Zanahoria", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud" } },
        { name: "Tomate frito", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Huevos", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud" } },
        { name: "Pan rallado", quantity: { amount: 60, unit: "g", scalable: false, originalText: "60 g" } },
        { name: "Harina de trigo", quantity: { amount: 50, unit: "g", scalable: false, originalText: "para rebozar" } },
        { name: "Aceite de oliva", quantity: { amount: 4, unit: "cdas", scalable: false, originalText: "4 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Hacer las albóndigas",
          text: "Mezcla la carne picada con media cebolla rallada, 1 diente de ajo picado, el huevo, el pan rallado, sal y pimienta. Amasa bien durante 3 minutos. Forma bolas de 3 cm. Pásalas por harina y reserva.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Carne picada" }, { name: "Cebolla" }, { name: "Ajo" }, { name: "Huevos" }, { name: "Pan rallado" }, { name: "Harina de trigo" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Dorar las albóndigas",
          text: "Calienta 3 cdas de aceite en una cazuela a fuego vivo. Dora las albóndigas por todos los lados en tandas, 4–5 minutos por tanda. Retira y reserva.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Por tanda",
          ingredientRefs: [{ name: "Aceite de oliva" }],
        },
        {
          order: 3, title: "Hacer la salsa",
          text: "En la misma cazuela sofríe la cebolla restante picada y la zanahoria en rodajas con 1 cda de aceite, 8 minutos. Añade el ajo restante, el tomate frito y cocina 5 minutos.",
          hasTimer: true, durationSeconds: 780, timerLabel: "Salsa",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Zanahoria" }, { name: "Ajo" }, { name: "Tomate frito" }],
        },
        {
          order: 4, title: "Terminar el guiso",
          text: "Vuelve a incorporar las albóndigas a la salsa. Añade 150 ml de agua, tapa y cocina a fuego bajo 20 minutos hasta que la salsa espese y las albóndigas estén bien cocidas.",
          hasTimer: true, durationSeconds: 1200, timerLabel: "Guiso final",
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 31 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a99",
    name: "Filetes Empanados",
    description: "Finos filetes de ternera con un rebozado dorado y crujiente que esconde una carne tierna y jugosa en su interior. El truco está en el empanado triple y el aceite a la temperatura exacta.",
    prepTime: 10,
    cookTime: 15,
    difficulty: "Fácil",
    allergens: ["gluten", "huevo"],
    tags: ["ternera", "empanado", "frito", "clásico"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Ternera", quantity: { amount: 4, unit: "filetes", scalable: true, originalText: "4 filetes 150 g c/u finos" } },
        { name: "Pan rallado", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g" } },
        { name: "Huevos", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud batidos" } },
        { name: "Harina de trigo", quantity: { amount: 60, unit: "g", scalable: false, originalText: "60 g" } },
        { name: "Aceite de girasol", quantity: { amount: 400, unit: "ml", scalable: false, originalText: "abundante para freír" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud para servir" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar los filetes",
          text: "Si los filetes son gruesos, aplánalos con un mazo de cocina entre dos hojas de film. Salpimienta por ambos lados.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Ternera" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Empanar",
          text: "Prepara tres platos: uno con harina, uno con huevo batido y sal, uno con pan rallado. Pasa cada filete en ese orden —harina, huevo, pan rallado— presionando bien para que se adhiera. Para más crujiente, repite el baño en huevo y pan rallado.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Harina de trigo" }, { name: "Huevos" }, { name: "Pan rallado" }],
        },
        {
          order: 3, title: "Freír",
          text: "Calienta abundante aceite a 180 °C en una sartén honda. Fríe los filetes 2–3 minutos por cada lado hasta que el rebozado esté uniformemente dorado. Escurre sobre papel absorbente. Sirve con gajos de limón.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Fritura",
          ingredientRefs: [{ name: "Aceite de girasol" }, { name: "Limón" }],
        },
      ],
    },
  },

  // ── 32 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa4",
    name: "Bacalao con Tomate",
    description: "Lomos de bacalao desalado cocinados a fuego lento en una salsa de tomate especiada con pimentón ahumado y ajo. Un guiso marinero clásico de la cocina española que se hace en 25 minutos.",
    prepTime: 5,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: ["pescado"],
    tags: ["bacalao", "pescado", "tomate", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Bacalao", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g lomos desalados" } },
        { name: "Tomate frito", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Pimentón", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta dulce o ahumado" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "con cuidado, el bacalao ya es salado" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito",
          text: "Sofríe la cebolla y el ajo picados en aceite a fuego medio 8 minutos. Añade el pimentón, remueve 30 segundos y vierte el tomate frito. Cocina 8 minutos a fuego medio.",
          hasTimer: true, durationSeconds: 960, timerLabel: "Sofrito con tomate",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Pimentón" }, { name: "Tomate frito" }],
        },
        {
          order: 2, title: "Cocer el bacalao",
          text: "Seca los lomos de bacalao con papel de cocina. Colócalos sobre la salsa con la piel hacia abajo. Tapa y cocina a fuego suave 10 minutos hasta que el bacalao se separe en lascas. Prueba de sal antes de añadir.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción bacalao",
          ingredientRefs: [{ name: "Bacalao" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Reposar y servir",
          text: "Apaga el fuego y deja reposar 3 minutos. Sirve los lomos enteros sobre la salsa con perejil fresco picado opcional.",
          hasTimer: true, durationSeconds: 180, timerLabel: "Reposo",
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 33 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa6",
    name: "Sandwich Mixto",
    description: "El sandwich que nunca falla: pan de molde tostado con jamón cocido y queso fundido. Crujiente por fuera, derretido por dentro. Un clásico indestructible listo en 5 minutos.",
    prepTime: 3,
    cookTime: 5,
    difficulty: "Fácil",
    allergens: ["gluten", "lacteo"],
    tags: ["sandwich", "rápido", "jamón", "queso"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pan de molde", quantity: { amount: 8, unit: "rebanadas", scalable: true, originalText: "8 rebanadas" } },
        { name: "Jamón cocido", quantity: { amount: 150, unit: "g", scalable: true, originalText: "8 lonchas" } },
        { name: "Queso en Lonchas", quantity: { amount: 4, unit: "lonchas", scalable: true, originalText: "4 lonchas" } },
        { name: "Mantequilla", quantity: { amount: 20, unit: "g", scalable: false, originalText: "20 g para untar" } },
      ],
      steps: [
        {
          order: 1, title: "Montar el sandwich",
          text: "Unta mantequilla por un lado de cada rebanada de pan. Monta el sandwich con la mantequilla hacia fuera: pan, 2 lonchas de jamón, 1 loncha de queso, pan.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pan de molde" }, { name: "Jamón cocido" }, { name: "Queso en Lonchas" }, { name: "Mantequilla" }],
        },
        {
          order: 2, title: "Tostar",
          text: "Calienta una sartén antiadherente o sandwichera a fuego medio. Cocina el sandwich 2–3 minutos por cada lado, presionando ligeramente, hasta que esté dorado y el queso fundido.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Tostado",
          ingredientRefs: [],
        },
        {
          order: 3, title: "Servir",
          text: "Corta en diagonal y sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [],
        },
      ],
    },
  },

  // ── 34 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aab",
    name: "Alubias con Chorizo",
    description: "Potaje denso y reconfortante de alubias blancas con chorizo ahumado en un caldo con laurel y pimentón. Un plato de cuchara de los que calientan el cuerpo y el alma.",
    prepTime: 5,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: [],
    tags: ["alubias", "chorizo", "cuchara", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Alubias", quantity: { amount: 800, unit: "g", scalable: true, originalText: "2 botes 400 g c/u cocidas" } },
        { name: "Chorizo", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g en rodajas" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Pimentón", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta ahumado" } },
        { name: "Laurel", quantity: { amount: 1, unit: "hoja", scalable: false, originalText: "1 hoja" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito y chorizo",
          text: "Sofríe la cebolla y el ajo picados en aceite a fuego medio 6 minutos. Añade el chorizo en rodajas y saltea 3 minutos hasta que suelte su aceite rojo. Incorpora el pimentón y remueve 30 segundos.",
          hasTimer: true, durationSeconds: 570, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Chorizo" }, { name: "Pimentón" }],
        },
        {
          order: 2, title: "Cocer las alubias",
          text: "Escurre y enjuaga las alubias. Incorpóralas junto con el laurel y 400 ml de agua. Lleva a ebullición suave y cocina 15 minutos. Aplasta unas pocas alubias con el dorso de la cuchara para espesar el caldo.",
          hasTimer: true, durationSeconds: 900, timerLabel: "Cocción",
          ingredientRefs: [{ name: "Alubias" }, { name: "Laurel" }],
        },
        {
          order: 3, title: "Ajustar y servir",
          text: "Retira el laurel, rectifica de sal y sirve bien caliente. El potaje mejora reposando 10 minutos antes de servir.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Sal" }],
        },
      ],
    },
  },

  // ── 35 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a8b",
    name: "Lentejas",
    description: "El puchero de lentejas de siempre: pardinas cocidas con chorizo, morcilla, verduras y un sofrito de pimentón que le da el color y el aroma inconfundibles. Un plato de cuchara completo, nutritivo y absolutamente español.",
    prepTime: 10,
    cookTime: 45,
    difficulty: "Media",
    allergens: [],
    tags: ["lentejas", "legumbres", "cuchara", "español"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Lentejas", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g pardinas (no hace falta remojar)" } },
        { name: "Chorizo", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g en rodajas" } },
        { name: "Morcilla", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g en rodajas" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Pimiento verde", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Zanahoria", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Pimentón", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta dulce" } },
        { name: "Laurel", quantity: { amount: 1, unit: "hoja", scalable: false, originalText: "1 hoja" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito",
          text: "Sofríe en aceite a fuego medio la cebolla, el pimiento y la zanahoria picados durante 8 minutos. Añade el ajo picado y el pimentón, remueve 30 segundos.",
          hasTimer: true, durationSeconds: 510, timerLabel: "Sofrito",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Pimiento verde" }, { name: "Zanahoria" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Pimentón" }],
        },
        {
          order: 2, title: "Añadir lentejas y embutidos",
          text: "Incorpora las lentejas enjuagadas, el chorizo, la morcilla y el laurel. Cubre con agua fría (doble volumen de las lentejas). Lleva a ebullición.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Lentejas" }, { name: "Chorizo" }, { name: "Morcilla" }, { name: "Laurel" }],
        },
        {
          order: 3, title: "Cocer a fuego lento",
          text: "Baja el fuego al mínimo, tapa parcialmente y cocina 30–35 minutos hasta que las lentejas estén tiernas. Remueve de vez en cuando y añade agua si se queda sin caldo.",
          hasTimer: true, durationSeconds: 2100, timerLabel: "Cocción lentejas",
          ingredientRefs: [],
        },
        {
          order: 4, title: "Ajustar y servir",
          text: "Retira el laurel, rectifica de sal. Si el caldo está muy líquido, sube el fuego y cuece destapado 5 minutos más. Sirve bien caliente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Sal" }],
        },
      ],
    },
  },

  // ── 36 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a8e",
    name: "Hamburguesa de Pollo",
    description: "Hamburguesa de pollo jugosa y tierna con queso fundido, lechuga fresca y tomate en un pan brioche dorado. Una alternativa más ligera a la clásica de ternera, con todo el sabor y la satisfacción.",
    prepTime: 5,
    cookTime: 12,
    difficulty: "Fácil",
    allergens: ["gluten", "lacteo"],
    tags: ["hamburguesa", "pollo", "rápido", "americano"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Hamburguesas de pollo", quantity: { amount: 4, unit: "ud", scalable: true, originalText: "4 ud 120 g c/u" } },
        { name: "Pan Brioche", quantity: { amount: 4, unit: "ud", scalable: true, originalText: "4 ud" } },
        { name: "Queso en Lonchas", quantity: { amount: 4, unit: "lonchas", scalable: true, originalText: "4 lonchas" } },
        { name: "Lechuga", quantity: { amount: 4, unit: "hojas", scalable: true, originalText: "4 hojas" } },
        { name: "Tomate", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud en rodajas" } },
        { name: "Aceite de oliva", quantity: { amount: 1, unit: "cda", scalable: false, originalText: "1 cda" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Cocinar la hamburguesa",
          text: "Salpimienta las hamburguesas. Calienta una sartén o plancha con el aceite a fuego medio-alto. Cocina 4–5 minutos por el primer lado. Gira, coloca el queso y cocina 3–4 minutos más hasta que el queso se funda.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Cocción",
          ingredientRefs: [{ name: "Hamburguesas de pollo" }, { name: "Queso en Lonchas" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Tostar el pan",
          text: "Tuesta el pan brioche partido en la misma plancha 1 minuto hasta que esté ligeramente dorado.",
          hasTimer: true, durationSeconds: 60, timerLabel: "Tostado pan",
          ingredientRefs: [{ name: "Pan Brioche" }],
        },
        {
          order: 3, title: "Montar y servir",
          text: "Base del pan, hoja de lechuga, rodaja de tomate, hamburguesa con queso y tapa. Sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Lechuga" }, { name: "Tomate" }],
        },
      ],
    },
  },

  // ── 37 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a87",
    name: "Pollo al Curry",
    description: "Dados de pollo en una salsa de curry suave y cremosa con leche evaporada y cebolla caramelizada. Perfumado con especias cálidas y listo en 30 minutos, es el plato favorito de los amantes de la cocina con personalidad.",
    prepTime: 10,
    cookTime: 30,
    difficulty: "Media",
    allergens: ["lacteo"],
    tags: ["pollo", "curry", "indio", "cremoso"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pollo", quantity: { amount: 700, unit: "g", scalable: true, originalText: "700 g pechuga en dados" } },
        { name: "Curry", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas (ajusta al gusto)" } },
        { name: "Leche evaporada", quantity: { amount: 400, unit: "ml", scalable: true, originalText: "1 bote 400 ml" } },
        { name: "Cebolla", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Dorar el pollo",
          text: "Salpimienta el pollo. Calienta el aceite a fuego vivo y dora los dados 5 minutos hasta que estén sellados. Retira y reserva.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Dorar pollo",
          ingredientRefs: [{ name: "Pollo" }, { name: "Aceite de oliva" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Caramelizar la cebolla",
          text: "En la misma sartén baja el fuego a medio. Sofríe la cebolla en juliana fina con una pizca de sal durante 12–15 minutos hasta que esté dorada y caramelizada. Añade el ajo picado y cocina 2 minutos más.",
          hasTimer: true, durationSeconds: 840, timerLabel: "Caramelizar cebolla",
          ingredientRefs: [{ name: "Cebolla" }, { name: "Ajo" }],
        },
        {
          order: 3, title: "Añadir curry y leche",
          text: "Incorpora el curry y remueve 1 minuto para tostarlo. Vierte la leche evaporada y mezcla bien. Vuelve a poner el pollo, lleva a ebullición suave y cocina 10 minutos hasta que la salsa espese.",
          hasTimer: true, durationSeconds: 660, timerLabel: "Cocción final",
          ingredientRefs: [{ name: "Curry" }, { name: "Leche evaporada" }],
        },
      ],
    },
  },

  // ── 38 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a94",
    name: "Pasta con Atún y Tomate",
    description: "Pasta con una salsa de tomate casera y atún desmenuzado, perfumada con ajo y orégano. Una receta de despensa imprescindible que sabe mejor de lo que parece y está lista en 20 minutos.",
    prepTime: 5,
    cookTime: 20,
    difficulty: "Fácil",
    allergens: ["gluten", "pescado"],
    tags: ["pasta", "atún", "tomate", "rápido"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pasta", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g (penne o fusilli)" } },
        { name: "Atún en lata", quantity: { amount: 3, unit: "latas", scalable: true, originalText: "3 latas 80 g c/u en aceite" } },
        { name: "Tomate frito", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Orégano", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar la salsa",
          text: "Sofríe el ajo laminado en aceite a fuego medio 2 minutos. Añade el tomate frito y el orégano. Cocina 8 minutos a fuego medio hasta que espese. Escurre el atún e incorpóralo, removiendo suavemente 2 minutos.",
          hasTimer: true, durationSeconds: 720, timerLabel: "Salsa",
          ingredientRefs: [{ name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Tomate frito" }, { name: "Orégano" }, { name: "Atún en lata" }],
        },
        {
          order: 2, title: "Cocer la pasta",
          text: "Cuece la pasta en agua salada al dente. Reserva un vaso del agua de cocción antes de escurrir.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción pasta",
          ingredientRefs: [{ name: "Pasta" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Mezclar y servir",
          text: "Añade la pasta escurrida a la salsa. Mezcla a fuego suave 1 minuto, añadiendo agua de cocción si es necesario para ligar. Sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pasta" }],
        },
      ],
    },
  },

  // ── 39 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa5",
    name: "Merluza Rebozada",
    description: "Filetes de merluza con un rebozado fino y dorado, crujiente por fuera y con la carne del pescado jugosa y tierna en el interior. Servida con limón y una ensalada, es una cena ligera y deliciosa.",
    prepTime: 10,
    cookTime: 15,
    difficulty: "Fácil",
    allergens: ["gluten", "huevo", "pescado"],
    tags: ["merluza", "rebozado", "frito", "pescado"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Merluza", quantity: { amount: 600, unit: "g", scalable: true, originalText: "600 g en filetes sin espinas" } },
        { name: "Huevos", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud batidos" } },
        { name: "Pan rallado", quantity: { amount: 100, unit: "g", scalable: true, originalText: "100 g" } },
        { name: "Harina de trigo", quantity: { amount: 50, unit: "g", scalable: false, originalText: "50 g" } },
        { name: "Aceite de girasol", quantity: { amount: 400, unit: "ml", scalable: false, originalText: "abundante para freír" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud para servir" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar el pescado",
          text: "Seca los filetes de merluza con papel de cocina y salpimienta. Córtalos en porciones si son grandes.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Merluza" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Empanar",
          text: "Pasa cada filete por harina (sacude el exceso), luego por huevo batido con sal y finalmente por pan rallado, presionando para que se adhiera.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Harina de trigo" }, { name: "Huevos" }, { name: "Pan rallado" }],
        },
        {
          order: 3, title: "Freír",
          text: "Calienta el aceite a 180 °C. Fríe los filetes 2–3 minutos por cada lado hasta que estén dorados. Escurre sobre papel absorbente. Sirve con gajos de limón.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Fritura",
          ingredientRefs: [{ name: "Aceite de girasol" }, { name: "Limón" }],
        },
      ],
    },
  },

  // ── 40 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aaa",
    name: "Garbanzos con Espinacas",
    description: "Un guiso andaluz clásico y vibrante: garbanzos cremosos con espinacas frescas en una base de ajo, comino y pimentón. Vegano, proteico y listo en 20 minutos con garbanzos de bote.",
    prepTime: 5,
    cookTime: 20,
    difficulty: "Fácil",
    allergens: [],
    tags: ["garbanzos", "espinacas", "vegano", "andaluz"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Garbanzos cocidos en bote", quantity: { amount: 800, unit: "g", scalable: true, originalText: "2 botes 400 g c/u" } },
        { name: "Espinacas", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g frescas o congeladas" } },
        { name: "Ajo", quantity: { amount: 4, unit: "dientes", scalable: true, originalText: "4 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Comino", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Pimentón", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta dulce o ahumado" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Sofrito de ajo y especias",
          text: "Lamina el ajo y dóralo en aceite a fuego medio 2 minutos. Añade el comino y el pimentón, remueve 30 segundos. Retira del fuego un momento para que las especias no se quemen.",
          hasTimer: true, durationSeconds: 150, timerLabel: "Sofrito especias",
          ingredientRefs: [{ name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Comino" }, { name: "Pimentón" }],
        },
        {
          order: 2, title: "Añadir espinacas",
          text: "Vuelve al fuego y añade las espinacas. Saltea 3–4 minutos removiendo hasta que se marchiten y pierdan el agua. Salpimienta.",
          hasTimer: true, durationSeconds: 240, timerLabel: "Saltear espinacas",
          ingredientRefs: [{ name: "Espinacas" }, { name: "Sal" }],
        },
        {
          order: 3, title: "Incorporar garbanzos",
          text: "Escurre y enjuaga los garbanzos. Añádelos a la sartén con 150 ml de agua. Cocina a fuego medio 10 minutos, aplastando algunos garbanzos para espesar. Rectifica de sal.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción final",
          ingredientRefs: [{ name: "Garbanzos cocidos en bote" }],
        },
      ],
    },
  },

  // ── 41 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a8a",
    name: "Alcachofas con Jamón y Burrata",
    description: "Alcachofas tiernas salteadas con lonchas de jamón y coronadas con una burrata cremosa en su punto. Una combinación de texturas y sabores que convierte ingredientes cotidianos en un plato de bistró.",
    prepTime: 15,
    cookTime: 15,
    difficulty: "Media",
    allergens: ["lacteo"],
    tags: ["alcachofas", "burrata", "jamón", "premium"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Alcachofas", quantity: { amount: 8, unit: "ud", scalable: true, originalText: "8 ud frescas o 2 botes en conserva" } },
        { name: "Jamón", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g jamón ibérico en tiras" } },
        { name: "Burrata", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud ~125 g c/u" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas virgen extra" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "zumo de 1 ud" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "pimienta negra recién molida" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar las alcachofas",
          text: "Si son frescas: retira las hojas externas duras, corta las puntas y el tallo. Cuécelas en agua con sal y zumo de limón 15 minutos. Escurre y parte por la mitad. Si son de conserva, solo escurre y seca bien.",
          hasTimer: true, durationSeconds: 900, timerLabel: "Cocción alcachofas (frescas)",
          ingredientRefs: [{ name: "Alcachofas" }, { name: "Limón" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Saltear",
          text: "Calienta 2 cdas de aceite en una sartén a fuego vivo. Saltea las alcachofas cortadas hacia abajo 3–4 minutos hasta que se doren. Añade las tiras de jamón y saltea 1 minuto más.",
          hasTimer: true, durationSeconds: 300, timerLabel: "Saltear",
          ingredientRefs: [{ name: "Alcachofas" }, { name: "Jamón" }, { name: "Aceite de oliva" }],
        },
        {
          order: 3, title: "Montar el plato",
          text: "Extiende las alcachofas y el jamón en la fuente. Rompe las burratas encima, riega con aceite virgen extra, pimienta recién molida y una gota de zumo de limón. Sirve inmediatamente.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Burrata" }, { name: "Aceite de oliva" }, { name: "Pimienta" }, { name: "Limón" }],
        },
      ],
    },
  },

  // ── 42 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a9a",
    name: "Pechuga Empanada",
    description: "Pechugas de pollo aplanadas con un rebozado crujiente y dorado que envuelve una carne jugosa y tierna. La versión española del schnitzel, rápida, económica y deliciosa.",
    prepTime: 10,
    cookTime: 12,
    difficulty: "Fácil",
    allergens: ["gluten", "huevo"],
    tags: ["pollo", "empanado", "frito", "clásico"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pollo", quantity: { amount: 4, unit: "pechugas", scalable: true, originalText: "4 pechugas 150 g c/u" } },
        { name: "Pan rallado", quantity: { amount: 150, unit: "g", scalable: true, originalText: "150 g" } },
        { name: "Huevos", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud batidos" } },
        { name: "Harina de trigo", quantity: { amount: 60, unit: "g", scalable: false, originalText: "60 g" } },
        { name: "Aceite de girasol", quantity: { amount: 400, unit: "ml", scalable: false, originalText: "abundante para freír" } },
        { name: "Limón", quantity: { amount: 1, unit: "ud", scalable: false, originalText: "1 ud para servir" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar las pechugas",
          text: "Coloca cada pechuga entre dos hojas de film y aplánala con un mazo hasta 1 cm de grosor. Salpimienta por ambos lados.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Pollo" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Empanar",
          text: "Pasa cada pechuga por harina, luego huevo batido y finalmente pan rallado, presionando para que se adhiera bien.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Harina de trigo" }, { name: "Huevos" }, { name: "Pan rallado" }],
        },
        {
          order: 3, title: "Freír",
          text: "Calienta el aceite a 180 °C. Fríe las pechugas 3–4 minutos por cada lado hasta que el rebozado esté uniformemente dorado. Escurre sobre papel absorbente y sirve con gajos de limón.",
          hasTimer: true, durationSeconds: 420, timerLabel: "Fritura",
          ingredientRefs: [{ name: "Aceite de girasol" }, { name: "Limón" }],
        },
      ],
    },
  },

  // ── 43 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1aa1",
    name: "Berenjena Rellena",
    description: "Mitades de berenjena asadas y rellenas con un jugoso ragú de carne picada y tomate, cubiertas de queso gratinado. Un plato completo, vistoso y lleno de sabor mediterráneo.",
    prepTime: 20,
    cookTime: 40,
    difficulty: "Media",
    allergens: ["lacteo"],
    tags: ["berenjena", "rellena", "horno", "mediterráneo"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Berenjena", quantity: { amount: 4, unit: "ud", scalable: true, originalText: "4 ud medianas" } },
        { name: "Carne picada", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g" } },
        { name: "Tomate frito", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Queso rallado", quantity: { amount: 100, unit: "g", scalable: true, originalText: "100 g" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas" } },
        { name: "Orégano", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Asar las berenjenas",
          text: "Precalienta el horno a 200 °C. Corta las berenjenas por la mitad a lo largo. Haz cortes en la pulpa en cuadrícula sin llegar a la piel. Pinta con aceite, salpimienta y hornea 20 minutos boca arriba. Vacía la pulpa con una cuchara y resérvala.",
          hasTimer: true, durationSeconds: 1200, timerLabel: "Asar berenjenas",
          ingredientRefs: [{ name: "Berenjena" }, { name: "Aceite de oliva" }, { name: "Sal" }, { name: "Pimienta" }],
        },
        {
          order: 2, title: "Preparar el relleno",
          text: "Sofríe la cebolla y el ajo picados en aceite 5 minutos. Añade la carne picada y cocina 8 minutos. Incorpora la pulpa de berenjena picada, el tomate frito y el orégano. Cocina 5 minutos más.",
          hasTimer: true, durationSeconds: 1080, timerLabel: "Relleno",
          ingredientRefs: [{ name: "Carne picada" }, { name: "Cebolla" }, { name: "Ajo" }, { name: "Berenjena" }, { name: "Tomate frito" }, { name: "Orégano" }],
        },
        {
          order: 3, title: "Rellenar y gratinar",
          text: "Rellena las mitades de berenjena con el ragú. Cubre con queso rallado y hornea 15 minutos más hasta que el queso esté dorado y burbujeante.",
          hasTimer: true, durationSeconds: 900, timerLabel: "Gratinado",
          ingredientRefs: [{ name: "Queso rallado" }],
        },
      ],
    },
  },

  // ── 44 ──────────────────────────────────────────────────────────────────────
  {
    _id: "6a0ecd41b18253e94a27757e",
    name: "Ensalada Mixta",
    description: "Ensalada fresca y colorida con lechuga crujiente, tomate maduro, cebolla y aceitunas, aliñada con aceite de oliva virgen extra. El acompañamiento perfecto para cualquier plato principal.",
    prepTime: 10,
    cookTime: 0,
    difficulty: "Fácil",
    allergens: [],
    tags: ["ensalada", "vegetariano", "fresco", "ligero"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Lechuga", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud o 150 g en bolsa" } },
        { name: "Tomate", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud maduros" } },
        { name: "Cebolla", quantity: { amount: 0.5, unit: "ud", scalable: true, originalText: "media cebolla" } },
        { name: "Aceitunas", quantity: { amount: 80, unit: "g", scalable: true, originalText: "80 g" } },
        { name: "Aceite de oliva", quantity: { amount: 3, unit: "cdas", scalable: false, originalText: "3 cdas virgen extra" } },
        { name: "Vinagre", quantity: { amount: 1, unit: "cda", scalable: false, originalText: "1 cda" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Preparar los ingredientes",
          text: "Lava y seca bien la lechuga. Córtala en trozos grandes. Corta el tomate en gajos o medias lunas. Pela y lamina la cebolla muy fina. Escurre las aceitunas.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Lechuga" }, { name: "Tomate" }, { name: "Cebolla" }, { name: "Aceitunas" }],
        },
        {
          order: 2, title: "Aliñar y servir",
          text: "Coloca todos los ingredientes en una ensaladera. Aliña con aceite de oliva virgen extra, vinagre y sal en el momento de servir. Mezcla con suavidad.",
          hasTimer: false, durationSeconds: null, timerLabel: null,
          ingredientRefs: [{ name: "Aceite de oliva" }, { name: "Vinagre" }, { name: "Sal" }],
        },
      ],
    },
  },

  // ── 45 ──────────────────────────────────────────────────────────────────────
  {
    _id: "6a0ecd41b18253e94a277584",
    name: "Verduras Salteadas",
    description: "Brócoli, zanahoria y calabacín salteados a fuego vivo con ajo y un toque de salsa de soja, con las verduras tiernas pero con una ligera textura crujiente. Un acompañamiento saludable, colorido y listo en 15 minutos.",
    prepTime: 10,
    cookTime: 15,
    difficulty: "Fácil",
    allergens: ["gluten"],
    tags: ["verduras", "saludable", "vegano", "rápido"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Brócoli", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g en ramilletes" } },
        { name: "Zanahoria", quantity: { amount: 2, unit: "ud", scalable: true, originalText: "2 ud en bastones" } },
        { name: "Calabacín", quantity: { amount: 1, unit: "ud", scalable: true, originalText: "1 ud en medias lunas" } },
        { name: "Ajo", quantity: { amount: 3, unit: "dientes", scalable: true, originalText: "3 dientes laminados" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Salsa de soja", quantity: { amount: 2, unit: "cdas", scalable: false, originalText: "2 cdas" } },
        { name: "Sal", quantity: { amount: 1, unit: "pizca", scalable: false, originalText: "al gusto" } },
        { name: "Pimienta", quantity: { amount: 0.5, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Escaldar el brócoli",
          text: "Cuece los ramilletes de brócoli en agua hirviendo con sal 3 minutos. Escurre y enfría en agua helada para cortar la cocción y fijar el color verde brillante.",
          hasTimer: true, durationSeconds: 180, timerLabel: "Escaldar brócoli",
          ingredientRefs: [{ name: "Brócoli" }, { name: "Sal" }],
        },
        {
          order: 2, title: "Saltear las verduras",
          text: "Calienta el aceite en un wok o sartén grande a fuego máximo. Añade la zanahoria y saltea 3 minutos. Añade el calabacín y el ajo laminado y saltea 3 minutos más. Incorpora el brócoli y saltea todo junto 2 minutos más.",
          hasTimer: true, durationSeconds: 480, timerLabel: "Salteado",
          ingredientRefs: [{ name: "Zanahoria" }, { name: "Calabacín" }, { name: "Ajo" }, { name: "Aceite de oliva" }, { name: "Brócoli" }],
        },
        {
          order: 3, title: "Terminar y servir",
          text: "Vierte la salsa de soja y saltea 1 minuto más a fuego vivo. Ajusta de pimienta y sal. Sirve inmediatamente como guarnición o plato principal.",
          hasTimer: true, durationSeconds: 60, timerLabel: "Soja",
          ingredientRefs: [{ name: "Salsa de soja" }, { name: "Pimienta" }],
        },
      ],
    },
  },

  // ── 30 ──────────────────────────────────────────────────────────────────────
  {
    _id: "69b01186d23dad82231d1a92",
    name: "Macarrones con Chorizo",
    description: "Macarrones en salsa de tomate especiada con rodajas de chorizo que sueltan todo su aceite rojo y ahumado. Una receta de cuchara rápida, contundente y llena de personalidad.",
    prepTime: 5,
    cookTime: 25,
    difficulty: "Fácil",
    allergens: ["gluten"],
    tags: ["pasta", "chorizo", "español", "rápido"],
    baseServings: 4,
    recipe: {
      ingredients: [
        { name: "Pasta", quantity: { amount: 400, unit: "g", scalable: true, originalText: "400 g macarrones" } },
        { name: "Chorizo", quantity: { amount: 200, unit: "g", scalable: true, originalText: "200 g en rodajas" } },
        { name: "Tomate frito", quantity: { amount: 300, unit: "g", scalable: true, originalText: "300 g" } },
        { name: "Ajo", quantity: { amount: 2, unit: "dientes", scalable: true, originalText: "2 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 1, unit: "cda", scalable: false, originalText: "1 cda" } },
        { name: "Orégano", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "1 cdta" } },
        { name: "Sal", quantity: { amount: 1, unit: "cdta", scalable: false, originalText: "al gusto" } },
      ],
      steps: [
        {
          order: 1, title: "Dorar el chorizo",
          text: "Calienta el aceite en una sartén a fuego medio. Añade el chorizo en rodajas y dora 3 minutos por cada lado hasta que suelte su aceite rojo. Añade el ajo laminado y saltea 1 minuto.",
          hasTimer: true, durationSeconds: 420, timerLabel: "Dorar chorizo",
          ingredientRefs: [{ name: "Chorizo" }, { name: "Ajo" }, { name: "Aceite de oliva" }],
        },
        {
          order: 2, title: "Añadir el tomate",
          text: "Incorpora el tomate frito y el orégano. Cocina a fuego medio 10 minutos removiendo ocasionalmente hasta obtener una salsa densa.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción salsa",
          ingredientRefs: [{ name: "Tomate frito" }, { name: "Orégano" }],
        },
        {
          order: 3, title: "Cocer la pasta y mezclar",
          text: "Cuece los macarrones en agua salada al dente. Escurre y mezcla directamente con la salsa en la sartén a fuego bajo 2 minutos para que todo se integre.",
          hasTimer: true, durationSeconds: 600, timerLabel: "Cocción pasta",
          ingredientRefs: [{ name: "Pasta" }, { name: "Sal" }],
        },
      ],
    },
  },

];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const url = resolveMongoUrl();
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const dishes = db.collection("kitchendishes");

  console.log(`\n── Enriqueciendo ${DISHES.length} master dishes ──────────────────`);
  let updated = 0;

  for (const d of DISHES) {
    const existing = await dishes.findOne({ _id: new ObjectId(d._id) });
    if (!existing) { console.log(`  ⚠  Not found: ${d._id} (${d.name})`); continue; }

    const already = existing.recipe?.steps?.length > 0;
    if (already) { console.log(`  ⏭  Skip (ya tiene steps): ${d.name}`); continue; }

    console.log(`  ✎  ${d.name} [${d._id}] — ${d.recipe.steps.length} steps, ${d.recipe.ingredients.length} ingredients`);

    if (APPLY) {
      await dishes.updateOne(
        { _id: new ObjectId(d._id) },
        {
          $set: {
            description: d.description,
            prepTime: d.prepTime,
            cookTime: d.cookTime,
            difficulty: d.difficulty,
            allergens: d.allergens,
            tags: d.tags,
            baseServings: d.baseServings,
            "recipe.ingredients": d.recipe.ingredients,
            "recipe.steps": d.recipe.steps,
            updatedAt: NOW,
          },
        }
      );
    }
    updated++;
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Dishes procesados: ${updated} / ${DISHES.length}`);
  if (!APPLY) {
    console.log("DRY-RUN — nada aplicado. Usa --apply para ejecutar.");
  } else {
    console.log("✅ APLICADO correctamente.");
  }

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
