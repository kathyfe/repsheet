# Shopping list page

`index.html` is this week's shopping list. Kathy opens it on her phone and shares it to Bring!, which reads the JSON-LD block and lets her untick what she already has.

The Health Coach rewrites it each week using the Shopping list skill in Kat OS (Notion). Keep the structure, change only the content.

## Rules

- Groceries and meal names only. The page is public, so nothing personal.
- Metric only (g, kg, ml, l or pieces). Whole numbers, rounded up to buyable amounts.
- One line per ingredient with the weekly total. Meals are listed separately, without quantities.
- The JSON-LD `recipeIngredient` lines and the visible list must hold exactly the same items and amounts, written quantity first: `500 g chicken breast`, `2 limes`.

## What to change each week

1. `<title>` stays "Shopping list".
2. JSON-LD `name`: `Shopping list: week of 26 Oct`.
3. JSON-LD `recipeIngredient`: one string per item.
4. `.sub` line: `Week of 26 Oct. Share this page to Bring! and untick what you already have.`
5. Visible groups, in this order, skipping empty ones: Fruit & veg, Meat & fish, Dairy & eggs, Bakery, Pantry, Frozen, Other. Each item is
   `<li><span>Chicken breast</span><span class="qty">500 g</span></li>`
6. "This week's meals": `<li>Meal name</li>` in the `meals` list.
7. Optional "Use it up" section after the meals, same markup as the meals list:
   ```html
   <h2>Use it up</h2>
   <ul class="meals">
     <li>Rest of the coriander goes into Thursday's wraps.</li>
   </ul>
   ```

Commit message: `Shopping list: week of 26 Oct`.
