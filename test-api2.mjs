const res = await fetch("http://localhost:3000/api/clasificar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ producto: "8414.90.20.110W", debug: true })
});
const data = await res.json();
console.log(data.filtered.find(f => f.codigo === '8414.90.20.110W'));
