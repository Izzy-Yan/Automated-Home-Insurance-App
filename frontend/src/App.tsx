
import { useEffect, useState } from "react";
import { questionnaire } from "./questionnaire";

type Property = {
  id: number;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
};

type SavedAnswer = {
  id: number;
  question_key: string;
  answer_value: string;
};

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

type ExtractedField = {
  field_key: string;
  label?: string;
  value: string;
  confidence: number | null;
  source_type: string;
  review_status: string;
};

type AnalysisResult = {
  mode: string;
  message: string;
  photo_count: number;
  video_count: number;
  frame_count: number;
  errors: { evidence_id: number; error: string }[];
  fields: ExtractedField[];
};

const fieldLabels: Record<string, string> = {
  number_of_stories: "Number of stories",
  exterior_wall_type: "Exterior wall material",
  roof_type: "Roof material",
  foundation_type: "Foundation type",
  flooring_type: "Flooring material",
  countertop_material: "Countertop material",
  hvac_type: "HVAC equipment",
  water_heater_type: "Water heater type",
  electrical_service: "Electrical panel rating",
};

const pageStyle = {
  minHeight: "100vh",
  backgroundColor: "#f4f6f9",
  color: "#222222",
  padding: "30px 16px",
  fontFamily: "Arial, sans-serif",
};

const sectionStyle = {
  backgroundColor: "#ffffff",
  color: "#222222",
  padding: "24px",
  marginBottom: "24px",
  borderRadius: "10px",
  border: "1px solid #d8dce3",
};

const fieldStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "12px",
  marginTop: "8px",
  backgroundColor: "#ffffff",
  color: "#222222",
  border: "1px solid #b8bec8",
  borderRadius: "6px",
  fontSize: "16px",
};

const buttonStyle = {
  backgroundColor: "#2457a7",
  color: "#ffffff",
  padding: "12px 18px",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "16px",
};

function App() {
  const [property, setProperty] = useState<Property | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("CA");
  const [postalCode, setPostalCode] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savingAnswers, setSavingAnswers] = useState<
    Record<string, boolean>
  >({});

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const id = localStorage.getItem("activeInspectionId");

      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const inspectionResponse = await fetch(
          `/api/inspections/${id}`
        );

        if (!inspectionResponse.ok) {
          throw new Error("Could not load inspection.");
        }

        const savedInspection: Inspection =
          await inspectionResponse.json();

        const [propertyResponse, uploadsResponse, fieldsResponse] =
          await Promise.all([
            fetch(`/api/properties/${savedInspection.property_id}`),
            fetch(`/api/inspections/${id}/uploads`),
            fetch(`/api/inspections/${id}/fields`),
          ]);

        if (
          !propertyResponse.ok ||
          !uploadsResponse.ok ||
          !fieldsResponse.ok
        ) {
          throw new Error("Could not restore inspection data.");
        }

        const savedProperty: Property = await propertyResponse.json();
        const files: UploadedFile[] = await uploadsResponse.json();
        const fields: ExtractedField[] = await fieldsResponse.json();

        const restoredAnswers: Record<string, string> = {};

        for (const answer of savedInspection.answers || []) {
          restoredAnswers[answer.question_key] = answer.answer_value;
        }

        if (cancelled) return;

        setInspection(savedInspection);
        setProperty(savedProperty);
        setUploadedFiles(files);
        setExtractedFields(fields);
        setAnswers(restoredAnswers);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error ? err.message : "Restore failed."
        );
        localStorage.removeItem("activeInspectionId");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startInspection() {
    setError("");

    if (
      !address.trim() ||
      !city.trim() ||
      !state.trim() ||
      !postalCode.trim()
    ) {
      setError("Please complete all required address fields.");
      return;
    }

    setCreating(true);

    try {
      const propertyResponse = await fetch("/api/properties/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_line_1: address.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          postal_code: postalCode.trim(),
          year_built: yearBuilt ? Number(yearBuilt) : null,
        }),
      });

      if (!propertyResponse.ok) {
        throw new Error("Could not create property.");
      }

      const createdProperty: Property =
        await propertyResponse.json();

      const inspectionResponse = await fetch("/api/inspections/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: createdProperty.id,
        }),
      });

      if (!inspectionResponse.ok) {
        throw new Error("Could not create inspection.");
      }

      const createdInspection: Inspection =
        await inspectionResponse.json();

      setProperty(createdProperty);
      setInspection(createdInspection);
      setAnswers({});
      setUploadedFiles([]);
      setExtractedFields([]);
      setAnalysis(null);

      localStorage.setItem(
        "activeInspectionId",
        String(createdInspection.id)
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Creation failed."
      );
    } finally {
      setCreating(false);
    }
  }

  async function saveAnswer(key: string, value: string) {
    if (!inspection || !value.trim()) return;

    setSavingAnswers((previous) => ({
      ...previous,
      [key]: true,
    }));

    try {
      const response = await fetch(
        `/api/inspections/${inspection.id}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_key: key,
            answer_value: value,
          }),
        }
      );

      if (!response.ok) throw new Error("Could not save answer.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Save failed."
      );
    } finally {
      setSavingAnswers((previous) => ({
        ...previous,
        [key]: false,
      }));
    }
  }

  async function uploadFile(file: File) {
    if (!inspection) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/inspections/${inspection.id}/uploads`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.detail || "Upload failed.");
      }

      const uploaded: UploadedFile = await response.json();

      setUploadedFiles((previous) => [...previous, uploaded]);
      setAnalysis(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  async function analyzeProperty() {
    if (!inspection) return;

    setAnalyzing(true);
    setError("");

    try {
      const response = await fetch(
        `/api/inspections/${inspection.id}/analyze`,
        { method: "POST" }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.detail || "Analysis preparation failed.");
      }

      const result: AnalysisResult = await response.json();
      setAnalysis(result);

      const fieldsResponse = await fetch(
        `/api/inspections/${inspection.id}/fields`
      );

      if (fieldsResponse.ok) {
        const fields: ExtractedField[] = await fieldsResponse.json();
        setExtractedFields(fields);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Analysis failed."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function startNewInspection() {
    localStorage.removeItem("activeInspectionId");

    setInspection(null);
    setProperty(null);
    setUploadedFiles([]);
    setAnswers({});
    setSavingAnswers({});
    setExtractedFields([]);
    setAnalysis(null);
    setError("");

    setAddress("");
    setCity("");
    setState("CA");
    setPostalCode("");
    setYearBuilt("");
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <p>Loading saved inspection...</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "850px", margin: "0 auto" }}>
        <h1>Home Insurance Property Capture</h1>
        <p>
          Capture property evidence and prepare structured
          insurance application information.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              background: "#fff0f0",
              color: "#a00000",
              padding: "14px",
              borderRadius: "6px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {!inspection && (
          <section style={sectionStyle}>
            <h2>Start New Inspection</h2>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void startInspection();
              }}
              style={{ display: "grid", gap: "16px" }}
            >
              {[
                ["Street address", address, setAddress],
                ["City", city, setCity],
                ["State", state, setState],
                ["ZIP code", postalCode, setPostalCode],
              ].map(([label, value, setter]) => (
                <label key={label as string}>
                  {label as string} *
                  <input
                    style={fieldStyle}
                    value={value as string}
                    onChange={(event) =>
                      (setter as (value: string) => void)(
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              ))}

              <label>
                Year built (optional)
                <input
                  style={fieldStyle}
                  type="number"
                  min="1600"
                  max={new Date().getFullYear()}
                  value={yearBuilt}
                  onChange={(event) =>
                    setYearBuilt(event.target.value)
                  }
                />
              </label>

              <button
                type="submit"
                style={buttonStyle}
                disabled={creating}
              >
                {creating ? "Creating..." : "Start Inspection"}
              </button>
            </form>
          </section>
        )}

        {inspection && (
          <>
            <section style={sectionStyle}>
              <h2>Active Inspection</h2>
              <p><strong>Inspection:</strong> #{inspection.id}</p>
              <p><strong>Status:</strong> {inspection.status}</p>

              {property && (
                <p>
                  <strong>Address:</strong>{" "}
                  {property.address_line_1}, {property.city},{" "}
                  {property.state} {property.postal_code}
                </p>
              )}

              <button
                style={buttonStyle}
                type="button"
                onClick={startNewInspection}
              >
                Start New Inspection
              </button>
            </section>

            {questionnaire.map((section) => (
              <section key={section.id} style={sectionStyle}>
                <h2>{section.title}</h2>

                <div style={{ display: "grid", gap: "18px" }}>
                  {section.questions.map((question) => (
                    <label key={question.key}>
                      <strong>{question.label}</strong>

                      {question.type === "select" ? (
                        <select
                          style={fieldStyle}
                          value={answers[question.key] || ""}
                          onChange={(event) => {
                            const value = event.target.value;

                            setAnswers((previous) => ({
                              ...previous,
                              [question.key]: value,
                            }));

                            if (value) {
                              void saveAnswer(question.key, value);
                            }
                          }}
                        >
                          <option value="">Select an answer</option>

                          {question.options?.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          style={fieldStyle}
                          type={question.type}
                          value={answers[question.key] || ""}
                          onChange={(event) =>
                            setAnswers((previous) => ({
                              ...previous,
                              [question.key]: event.target.value,
                            }))
                          }
                          onBlur={() =>
                            void saveAnswer(
                              question.key,
                              answers[question.key] || ""
                            )
                          }
                        />
                      )}

                      {savingAnswers[question.key] && (
                        <small>Saving...</small>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <section style={sectionStyle}>
              <h2>Inspection Evidence</h2>
              <p>
                Upload photos, videos, and homeowner
                application documents.
              </p>

              <div style={{ display: "grid", gap: "18px" }}>
                {[
                  { label: "Photo", accept: "image/*" },
                  { label: "Video", accept: "video/*" },
                  {
                    label: "ACORD / application document",
                    accept: ".pdf,image/*",
                  },
                ].map((item) => (
                  <label key={item.label}>
                    <strong>{item.label}</strong>
                    <input
                      style={fieldStyle}
                      type="file"
                      accept={item.accept}
                      disabled={uploading || analyzing}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>

              {uploading && <p>Uploading file...</p>}

              <h3>Uploaded files ({uploadedFiles.length})</h3>

              {uploadedFiles.length === 0 ? (
                <p>No files uploaded yet.</p>
              ) : (
                <ul>
                  {uploadedFiles.map((file) => (
                    <li key={file.id}>
                      {file.evidence_type}:{" "}
                      {file.original_filename || "Unnamed file"}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={sectionStyle}>
              <h2>AI Property Extraction</h2>

              <p>
                Prepare uploaded property photos and sample
                video frames for visual analysis.
              </p>

              <div
                style={{
                  padding: "12px",
                  background: "#fff5df",
                  color: "#6b4700",
                  borderRadius: "6px",
                  marginBottom: "16px",
                }}
              >
                <strong>Mock mode:</strong> AI recognition is
                not connected yet. Results marked "unknown"
                are placeholders, not visual findings.
              </div>

              <button
                type="button"
                style={buttonStyle}
                onClick={() => void analyzeProperty()}
                disabled={
                  analyzing ||
                  uploading ||
                  uploadedFiles.length === 0
                }
              >
                {analyzing
                  ? "Preparing evidence..."
                  : "Analyze Property Evidence"}
              </button>

              {analysis && (
                <div style={{ marginTop: "22px" }}>
                  <h3>Preparation Results</h3>
                  <p>{analysis.message}</p>

                  <ul>
                    <li>Photos: {analysis.photo_count}</li>
                    <li>Videos: {analysis.video_count}</li>
                    <li>
                      Video frames extracted: {analysis.frame_count}
                    </li>
                  </ul>

                  {analysis.errors.length > 0 && (
                    <>
                      <h4>Processing errors</h4>
                      <ul>
                        {analysis.errors.map((item) => (
                          <li key={item.evidence_id}>
                            Evidence #{item.evidence_id}: {item.error}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <h3>Property Fields</h3>

              {extractedFields.length === 0 ? (
                <p>
                  No extraction records yet. Upload property
                  photos or videos, then run preparation.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ padding: "10px" }}>Field</th>
                        <th style={{ padding: "10px" }}>Value</th>
                        <th style={{ padding: "10px" }}>Source</th>
                        <th style={{ padding: "10px" }}>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedFields.map((field, index) => (
                        <tr
                          key={`${field.field_key}-${index}`}
                          style={{
                            borderTop: "1px solid #dddddd",
                          }}
                        >
                          <td style={{ padding: "10px" }}>
                            {fieldLabels[field.field_key] ||
                              field.field_key}
                          </td>
                          <td style={{ padding: "10px" }}>
                            {field.value}
                          </td>
                          <td style={{ padding: "10px" }}>
                            {field.source_type}
                          </td>
                          <td style={{ padding: "10px" }}>
                            {field.review_status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={sectionStyle}>
              <h2>Room Capture</h2>
              <p>
                Apple RoomPlan and LiDAR-assisted measurements
                will be integrated in a later milestone.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
