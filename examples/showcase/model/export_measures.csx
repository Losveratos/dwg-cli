// Schreibt alle Measures des Modells (Name → DAX) nach dwg/app/test/datasets/showcase/measures.json,
// damit die Mini-DAX genau die DAX-Ausdrücke des Modells rechnet.
// te script -m "showcase/ZlatyLev Showcase.SemanticModel" --file showcase/model/export_measures.csx
var d = new SortedDictionary<string, string>(StringComparer.Ordinal);
foreach (var m in Model.AllMeasures) d[m.Name] = m.Expression.Replace("\r\n", "\n").Trim();
var opts = new System.Text.Json.JsonSerializerOptions {
    WriteIndented = true,
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};
System.IO.File.WriteAllText("dwg/app/test/datasets/showcase/measures.json",
    System.Text.Json.JsonSerializer.Serialize(d, opts) + "\n", new System.Text.UTF8Encoding(false));
Info(d.Count + " Measures exportiert");
