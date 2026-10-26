import { useEffect, useState } from "react";
import BrokerReview from "./BrokerReview";
import { questionnaire } from "./questionnaire";

type Property = {
  id: number;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
};
type SavedAnswer = { id: number; question_key: string; answer_value: string };
type Inspection = {
  id: number;
  property_id: number;
  status: string;
  answers?: SavedAnswer[];
};
type UploadedFile = {
  id: number;
  inspection_id: number;
  evidence_type: string;
  original_filename: string | null;
  storage_key: string;
  size_bytes?: number;
};
type AnalysisResult = {
  mode: "mock" | "live";
  message: string;
  photo_count: number;
  video_count: number;
  frame_count: number;
  errors: { evidence_id: number; error: string }[];
  fields: unknown[];
};

const MAX_FILE_SIZE = 250 * 1024 * 1024;
const pageStyle = {
  minHeight: "100vh", backgroundColor: "#f4f6f9", color: "#222222",
  padding: "30px 16px", fontFamily: "Arial, sans-serif",
};
const sectionStyle = {
  backgroundColor: "#ffffff", color: "#222222", padding: "24px",
  marginBottom: "24px", borderRadius: "10px", border: "1px solid #d8dce3",
};
const fieldStyle = {
  display: "block", width: "100%", boxSizing: "border-box" as const,
  padding: "12px", marginTop: "8px", backgroundColor: "#ffffff",
  color: "#222222", border: "1px solid #b8bec8",
  borderRadius: "6px", fontSize: "16px",
};
const buttonStyle = {
  backgroundColor: "#2457a7", color: "#ffffff", padding: "12px 18px",
  border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "16px",
};

async function apiError(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      const message = (detail as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return `${fallback} (HTTP ${response.status})`;
}

export default function App() {
  const [property, setProperty] = useState<Property | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("CA");
  const [postalCode, setPostalCode] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savingAnswers, setSavingAnswers] = useState<Record<string, boolean>>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reviewVersion, setReviewVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const id = localStorage.getItem("activeInspectionId");
      if (!id) { setLoading(false); return; }
      try {
        const inspectionResponse = await fetch(`/api/inspections/${id}`);
        if (!inspectionResponse.ok) throw new Error(await apiError(inspectionResponse, "Could not load inspection"));
        const savedInspection: Inspection = await inspectionResponse.json();
        const [propertyResponse, uploadsResponse] = await Promise.all([
          fetch(`/api/properties/${savedInspection.property_id}`),
          fetch(`/api/inspections/${id}/uploads`),
        ]);
        if (!propertyResponse.ok || !uploadsResponse.ok) throw new Error("Could not restore property or uploaded files.");
        const savedProperty: Property = await propertyResponse.json();
        const files: UploadedFile[] = await uploadsResponse.json();
        const restoredAnswers: Record<string, string> = {};
        for (const answer of savedInspection.answers || []) restoredAnswers[answer.question_key] = answer.answer_value;
        if (cancelled) return;
        setInspection(savedInspection);
        setProperty(savedProperty);
        setUploadedFiles(files);
        setAnswers(restoredAnswers);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Restore failed");
        localStorage.removeItem("activeInspectionId");
      } finally { if (!cancelled) setLoading(false); }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  async function startInspection() {
    setError("");
    if (![address, city, state, postalCode].every((value) => value.trim())) {
      setError("Please complete all required address fields."); return;
    }
    setCreating(true);
    try {
      const propertyResponse = await fetch("/api/properties/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_line_1: address.trim(), city: city.trim(),
          state: state.trim().toUpperCase(), postal_code: postalCode.trim(),
          year_built: yearBuilt ? Number(yearBuilt) : null,
        }),
      });
      if (!propertyResponse.ok) throw new Error(await apiError(propertyResponse, "Could not create property"));
      const createdProperty: Property = await propertyResponse.json();
      const inspectionResponse = await fetch("/api/inspections/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: createdProperty.id }),
      });
      if (!inspectionResponse.ok) throw new Error(await apiError(inspectionResponse, "Could not create inspection"));
      const createdInspection: Inspection = await inspectionResponse.json();
      setProperty(createdProperty); setInspection(createdInspection);
      setAnswers({}); setUploadedFiles([]); setAnalysis(null); setReviewVersion(0);
      localStorage.setItem("activeInspectionId", String(createdInspection.id));
    } catch (err) { setError(err instanceof Error ? err.message : "Creation failed"); }
    finally { setCreating(false); }
  }

  async function saveAnswer(key: string, value: string) {
    if (!inspection || !value.trim()) return;
    setSavingAnswers((previous) => ({ ...previous, [key]: true }));
    try {
      const response = await fetch(`/api/inspections/${inspection.id}/answers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_key: key, answer_value: value }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Could not save answer"));
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setSavingAnswers((previous) => ({ ...previous, [key]: false })); }
  }

  async function uploadFile(file: File) {
    if (!inspection) return;
    setError("");
    if (file.size > MAX_FILE_SIZE) {
      setError(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. The current upload limit is 250 MB. Choose a shorter or compressed video.`);
      return;
    }
    setUploading(true); setUploadName(file.name);
    try {
      const formData = new FormData(); formData.append("file", file);
      const response = await fetch(`/api/inspections/${inspection.id}/uploads`, {
        method: "POST", body: formData,
      });
      if (!response.ok) throw new Error(await apiError(response, "Upload failed"));
      const uploaded: UploadedFile = await response.json();
      setUploadedFiles((previous) => [...previous, uploaded]);
      setAnalysis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Check the backend terminal and browser Network tab.");
    } finally { setUploading(false); setUploadName(""); }
  }

  async function analyzeProperty() {
    if (!inspection) return;
    setAnalyzing(true); setError("");
    try {
      const response = await fetch(`/api/inspections/${inspection.id}/analyze`, { method: "POST" });
      if (!response.ok) throw new Error(await apiError(response, "Analysis failed"));
      const result: AnalysisResult = await response.json();
      setAnalysis(result);
      setReviewVersion((value) => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Analysis failed"); }
    finally { setAnalyzing(false); }
  }

  function startNewInspection() {
    localStorage.removeItem("activeInspectionId");
    setInspection(null); setProperty(null); setUploadedFiles([]); setAnswers({});
    setSavingAnswers({}); setAnalysis(null); setReviewVersion(0); setError("");
    setAddress(""); setCity(""); setState("CA"); setPostalCode(""); setYearBuilt("");
  }

  if (loading) return <main style={pageStyle}><p>Loading saved inspection...</p></main>;

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "850px", margin: "0 auto" }}>
        <h1>Home Insurance Property Capture</h1>
        <p>Capture property evidence and prepare structured insurance application information.</p>
        {error && <div role="alert" style={{ background: "#fff0f0", color: "#a00000", padding: "14px", borderRadius: "6px", marginBottom: "20px", whiteSpace: "pre-wrap" }}>{error}</div>}
        {!inspection && (
          <section style={sectionStyle}>
            <h2>Start New Inspection</h2>
            <form onSubmit={(event) => { event.preventDefault(); void startInspection(); }} style={{ display: "grid", gap: "16px" }}>
              <label>Street address *<input style={fieldStyle} value={address} onChange={(event) => setAddress(event.target.value)} required /></label>
              <label>City *<input style={fieldStyle} value={city} onChange={(event) => setCity(event.target.value)} required /></label>
              <label>State *<input style={fieldStyle} value={state} onChange={(event) => setState(event.target.value)} required /></label>
              <label>ZIP code *<input style={fieldStyle} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} required /></label>
              <label>Year built (optional)<input style={fieldStyle} type="number" min="1600" max={new Date().getFullYear()} value={yearBuilt} onChange={(event) => setYearBuilt(event.target.value)} /></label>
              <button type="submit" style={buttonStyle} disabled={creating}>{creating ? "Creating..." : "Start Inspection"}</button>
            </form>
          </section>
        )}
        {inspection && (
          <>
            <section style={sectionStyle}>
              <h2>Active Inspection</h2>
              <p><strong>Inspection:</strong> #{inspection.id}</p>
              <p><strong>Status:</strong> {inspection.status}</p>
              {property && <p><strong>Address:</strong> {property.address_line_1}, {property.city}, {property.state} {property.postal_code}</p>}
              <button style={buttonStyle} type="button" onClick={startNewInspection}>Start New Inspection</button>
            </section>
            {questionnaire.map((section) => (
              <section key={section.id} style={sectionStyle}>
                <h2>{section.title}</h2>
                <div style={{ display: "grid", gap: "18px" }}>
                  {section.questions.map((question) => (
                    <label key={question.key}>
                      <strong>{question.label}</strong>
                      {question.type === "select" ? (
                        <select style={fieldStyle} value={answers[question.key] || ""} onChange={(event) => {
                          const value = event.target.value;
                          setAnswers((previous) => ({ ...previous, [question.key]: value }));
                          if (value) void saveAnswer(question.key, value);
                        }}>
                          <option value="">Select an answer</option>
                          {question.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input style={fieldStyle} type={question.type} value={answers[question.key] || ""}
                          onChange={(event) => setAnswers((previous) => ({ ...previous, [question.key]: event.target.value }))}
                          onBlur={() => void saveAnswer(question.key, answers[question.key] || "")} />
                      )}
                      {savingAnswers[question.key] && <small>Saving...</small>}
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <section style={sectionStyle}>
              <h2>Inspection Evidence</h2>
              <p>Upload photos, videos, and homeowner application documents. Maximum file size: 250 MB.</p>
              <div style={{ display: "grid", gap: "18px" }}>
                {[
                  { label: "Photo", accept: "image/*" },
                  { label: "Video", accept: "video/*" },
                  { label: "ACORD / application document", accept: ".pdf,image/*" },
                ].map((item) => (
                  <label key={item.label}>
                    <strong>{item.label}</strong>
                    <input style={fieldStyle} type="file" accept={item.accept} disabled={uploading || analyzing}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadFile(file);
                      }} />
                  </label>
                ))}
              </div>
              {uploading && <p role="status">Uploading {uploadName}... Large files may take longer.</p>}
              <h3>Uploaded files ({uploadedFiles.length})</h3>
              {uploadedFiles.length === 0 ? <p>No files uploaded yet.</p> : (
                <ul>{uploadedFiles.map((file) => <li key={file.id}>{file.evidence_type}: {file.original_filename || "Unnamed file"}</li>)}</ul>
              )}
            </section>
            <section style={sectionStyle}>
              <h2>AI Property Extraction</h2>
              <p>Prepare property photos and sampled video frames for analysis. When the API key is configured, the backend can generate candidate findings for broker review.</p>
              <button type="button" style={buttonStyle} onClick={() => void analyzeProperty()}
                disabled={analyzing || uploading || !uploadedFiles.some((file) => file.evidence_type === "photo" || file.evidence_type === "video")}>
                {analyzing ? "Analyzing evidence..." : "Analyze Property Evidence"}
              </button>
              {analysis && (
                <div style={{ marginTop: "22px" }}>
                  <h3>Analysis Results</h3>
                  <p><strong>Mode:</strong> {analysis.mode === "mock" ? "Mock — no AI findings generated" : "Live AI — findings require review"}</p>
                  <p>{analysis.message}</p>
                  <ul>
                    <li>Photos processed: {analysis.photo_count}</li>
                    <li>Videos processed: {analysis.video_count}</li>
                    <li>Video frames sampled: {analysis.frame_count}</li>
                    <li>Candidate findings from this run: {analysis.fields?.length ?? 0}</li>
                  </ul>
                  {analysis.errors?.length > 0 && (
                    <div role="alert">
                      <h4>Processing errors</h4>
                      <ul>{analysis.errors.map((item) => <li key={item.evidence_id}>Evidence #{item.evidence_id}: {item.error}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </section>
            <BrokerReview key={`${inspection.id}-${reviewVersion}`} inspectionId={inspection.id} />
            <section style={sectionStyle}>
              <h2>Room Capture</h2>
              <p>Apple RoomPlan and LiDAR-assisted measurements will be integrated in a later milestone.</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
