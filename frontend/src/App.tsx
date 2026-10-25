
import { useState } from "react";
import { questionnaire } from "./questionnaire";

type Property = {
  id: number;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
};

type Inspection = {
  id: number;
  property_id: number;
  status: string;
};

type UploadedFile = {
  id: number;
  inspection_id: number;
  evidence_type: string;
  original_filename: string;
  mime_type: string;
  storage_key: string;
  size_bytes: number;
};

function App() {
  const [property, setProperty] = useState<Property | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("CA");
  const [postalCode, setPostalCode] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savingAnswers, setSavingAnswers] = useState<Record<string, boolean>>({});

  async function startInspection() {
    setError("");

    if (!address.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setError("Please enter the street address, city, state, and ZIP code.");
      return;
    }

    try {
      const propertyResponse = await fetch("/api/properties/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address_line_1: address.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          postal_code: postalCode.trim(),
          year_built: yearBuilt ? Number(yearBuilt) : null,
        }),
      });

      if (!propertyResponse.ok) {
        const result = await propertyResponse.json().catch(() => null);
        throw new Error(result?.detail || "Failed to create property.");
      }

      const createdProperty: Property = await propertyResponse.json();
      setProperty(createdProperty);

      const inspectionResponse = await fetch("/api/inspections/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          property_id: createdProperty.id,
        }),
      });

      if (!inspectionResponse.ok) {
        const result = await inspectionResponse.json().catch(() => null);
        throw new Error(result?.detail || "Failed to create inspection.");
      }

      const createdInspection: Inspection = await inspectionResponse.json();
      setInspection(createdInspection);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }

  async function saveAnswer(questionKey: string, answerValue: string) {
    if (!inspection) return;

    // Empty values are kept in the UI but are not sent to the API.
    if (!answerValue.trim()) return;

    setError("");
    setSavingAnswers((previous) => ({
      ...previous,
      [questionKey]: true,
    }));

    try {
      const response = await fetch(
        `/api/inspections/${inspection.id}/answers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question_key: questionKey,
            answer_value: answerValue,
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.detail || `Failed to save ${questionKey}.`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save answer."
      );
    } finally {
      setSavingAnswers((previous) => ({
        ...previous,
        [questionKey]: false,
      }));
    }
  }

  async function uploadFile(file: File) {
    if (!inspection) return;

    setError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/inspections/${inspection.id}/uploads`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.detail || "File upload failed.");
      }

      const uploaded: UploadedFile = await response.json();

      setUploadedFiles((previous) => [...previous, uploaded]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "File upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  const pageStyle = {
    maxWidth: "760px",
    margin: "40px auto",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
    color: "#222",
  };

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px",
    marginTop: "6px",
    border: "1px solid #ccc",
    borderRadius: "5px",
    fontSize: "16px",
  };

  const sectionStyle = {
    marginBottom: "32px",
    padding: "20px",
    border: "1px solid #ddd",
    borderRadius: "8px",
  };

  const buttonStyle = {
    padding: "12px 18px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "16px",
  };

  return (
    <main style={pageStyle}>
      <h1>Home Insurance Property Capture</h1>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px",
            marginBottom: "20px",
            background: "#fff0f0",
            color: "#a00000",
            borderRadius: "5px",
          }}
        >
          {error}
        </div>
      )}

      {!inspection && (
        <section style={sectionStyle}>
          <h2>Property Information</h2>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void startInspection();
            }}
            style={{ display: "grid", gap: "14px" }}
          >
            <label>
              Street address *
              <input
                style={fieldStyle}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </label>

            <label>
              City *
              <input
                style={fieldStyle}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </label>

            <label>
              State *
              <input
                style={fieldStyle}
                value={state}
                onChange={(e) => setState(e.target.value)}
                maxLength={2}
                required
              />
            </label>

            <label>
              ZIP code *
              <input
                style={fieldStyle}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
              />
            </label>

            <label>
              Year built (if known)
              <input
                style={fieldStyle}
                type="number"
                min="1600"
                max={new Date().getFullYear()}
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value)}
              />
            </label>

            <button
              type="submit"
              style={{
                ...buttonStyle,
                background: "#2457a7",
                color: "white",
              }}
            >
              Start Inspection
            </button>
          </form>
        </section>
      )}

      {inspection && (
        <>
          <section style={sectionStyle}>
            <h2>Active Inspection</h2>
            <p>
              <strong>Inspection ID:</strong> {inspection.id}
            </p>
            <p>
              <strong>Property ID:</strong> {property?.id}
            </p>
            <p>
              <strong>Address:</strong>{" "}
              {property?.address_line_1}, {property?.city},{" "}
              {property?.state} {property?.postal_code}
            </p>
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
                        onChange={(e) => {
                          const value = e.target.value;

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
                        onChange={(e) =>
                          setAnswers((previous) => ({
                            ...previous,
                            [question.key]: e.target.value,
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
              Capture photos, record videos, or upload the homeowner's
              application and ACORD documents.
            </p>

            <div style={{ display: "grid", gap: "20px" }}>
              <label>
                <strong>Take or choose a photo</strong>
                <input
                  style={fieldStyle}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>

              <label>
                <strong>Record or choose a video</strong>
                <input
                  style={fieldStyle}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>

              <label>
                <strong>Homeowner application / ACORD document</strong>
                <input
                  style={fieldStyle}
                  type="file"
                  accept=".pdf,image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {uploading && (
              <p role="status">Uploading file. Please wait...</p>
            )}

            <h3>Uploaded files ({uploadedFiles.length})</h3>

            {uploadedFiles.length === 0 ? (
              <p>No files uploaded yet.</p>
            ) : (
              <ul>
                {uploadedFiles.map((file) => (
                  <li key={file.id} style={{ marginBottom: "8px" }}>
                    <strong>{file.evidence_type}</strong>
                    {" — "}
                    {file.original_filename}
                    {" "}
                    <small>({file.size_bytes.toLocaleString()} bytes)</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionStyle}>
            <h2>Room Capture</h2>
            <p>
              Room-by-room measurements and Apple RoomPlan integration
              are planned for a future step. For now, use the photo and
              video controls above to collect room evidence.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
