// Schreibt alle Measures des Modells (Name → DAX) nach app/test/datasets/showcase/measures.json,
// damit die Mini-DAX genau die DAX-Ausdrücke des Modells rechnet. Aus dem Repo aufrufen:
// te script -m "examples/showcase/ZlatyLev Showcase.SemanticModel" --file examples/showcase/model/export_measures.csx
var d = new SortedDictionary<string, string>(StringComparer.Ordinal);
foreach (var m in Model.AllMeasures) d[m.Name] = m.Expression.Replace("\r\n", "\n").Trim();
var opts = new System.Text.Json.JsonSerializerOptions {
    WriteIndented = true,
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};
System.IO.File.WriteAllText("app/test/datasets/showcase/measures.json",
    System.Text.Json.JsonSerializer.Serialize(d, opts) + "\n", new System.Text.UTF8Encoding(false));
Info(d.Count + " Measures exportiert");
