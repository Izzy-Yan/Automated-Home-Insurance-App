
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
  mime_type: string | null;
  storage_key: string;
  size_bytes?: number;
};

function App() {
  const [property, setProperty] = useState<Property | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);

  const [loadingInspection, setLoadingInspection] = useState(true);
  const [creatingInspection, setCreatingInspection] = useState(false);

  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("CA");
  const [postalCode, setPostalCode] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");

  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [savingAnswers, setSavingAnswers] = useState<
    Record<string, boolean>
  >({});

  // --------------------------------------------------
  // RESTORE SAVED INSPECTION
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function restoreInspection() {
      const savedId = localStorage.getItem("activeInspectionId");

      if (!savedId) {
        setLoadingInspection(false);
        return;
      }

      try {
        const inspectionResponse = await fetch(
          `/api/inspections/${savedId}`
        );

        if (!inspectionResponse.ok) {
          throw new Error("Could not restore the saved inspection.");
        }

        const savedInspection: Inspection =
          await inspectionResponse.json();

        const propertyResponse = await fetch(
          `/api/properties/${savedInspection.property_id}`
        );

        if (!propertyResponse.ok) {
          throw new Error("Could not load property information.");
        }

        const savedProperty: Property =
          await propertyResponse.json();

        const uploadsResponse = await fetch(
          `/api/inspections/${savedId}/uploads`
        );

        if (!uploadsResponse.ok) {
          throw new Error("Could not load uploaded files.");
        }

        const savedFiles: UploadedFile[] =
          await uploadsResponse.json();

        const restoredAnswers: Record<string, string> = {};

        for (const answer of savedInspection.answers || []) {
          restoredAnswers[answer.question_key] =
            answer.answer_value;
        }

        if (cancelled) return;

        setInspection(savedInspection);
        setProperty(savedProperty);
        setAnswers(restoredAnswers);
        setUploadedFiles(savedFiles);

      } catch (err) {
        if (cancelled) return;

        console.error("Restore failed:", err);

        setError(
          "Could not restore the previous inspection. " +
          "You can start a new inspection."
        );

        localStorage.removeItem("activeInspectionId");

      } finally {
        if (!cancelled) {
          setLoadingInspection(false);
        }
      }
    }

    void restoreInspection();

    return () => {
      cancelled = true;
    };
  }, []);

  // --------------------------------------------------
  // CREATE PROPERTY AND INSPECTION
  // --------------------------------------------------

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

    setCreatingInspection(true);

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
        throw new Error("Failed to create property.");
      }

      const createdProperty: Property =
        await propertyResponse.json();

      const inspectionResponse = await fetch(
        "/api/inspections/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            property_id: createdProperty.id,
          }),
        }
      );

      if (!inspectionResponse.ok) {
        throw new Error("Failed to create inspection.");
      }

      const createdInspection: Inspection =
        await inspectionResponse.json();

      setProperty(createdProperty);
      setInspection(createdInspection);

      setAnswers({});
      setUploadedFiles({} as never);
      setUploadedFiles([]);

      localStorage.setItem(
        "activeInspectionId",
        String(createdInspection.id)
      );

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );

    } finally {
      setCreatingInspection(false);
    }
  }

  // --------------------------------------------------
  // SAVE QUESTIONNAIRE ANSWER
  // --------------------------------------------------

  async function saveAnswer(
    questionKey: string,
    answerValue: string
  ) {
    if (!inspection || !answerValue.trim()) return;

    const inspectionId = inspection.id;

    setSavingAnswers((previous) => ({
      ...previous,
      [questionKey]: true,
    }));

    try {
      const response = await fetch(
        `/api/inspections/${inspectionId}/answers`,
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
        throw new Error("Failed to save answer.");
      }

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save answer."
      );

    } finally {
      setSavingAnswers((previous) => ({
        ...previous,
        [questionKey]: false,
      }));
    }
  }

  // --------------------------------------------------
  // UPLOAD FILE
  // --------------------------------------------------

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

        throw new Error(
          result?.detail || "File upload failed."
        );
      }

      const uploaded: UploadedFile = await response.json();

      setUploadedFiles((previous) => [
        ...previous,
        uploaded,
      ]);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "File upload failed."
      );

    } finally {
      setUploading(false);
    }
  }

  // --------------------------------------------------
  // START NEW INSPECTION
  // --------------------------------------------------

  function startNewInspection() {
    localStorage.removeItem("activeInspectionId");

    setProperty(null);
    setInspection(null);

    setAnswers({});
    setSavingAnswers({});
    setUploadedFiles([]);

    setError("");

    setAddress("");
    setCity("");
    setState("CA");
    setPostalCode("");
    setYearBuilt("");
  }

  // --------------------------------------------------
  // STYLES
  // --------------------------------------------------

  const pageStyle = {
    minHeight: "100vh",
    backgroundColor: "#f4f6f9",
    color: "#222222",
    padding: "30px 16px",
    fontFamily: "Arial, sans-serif",
  };

  const contentStyle = {
    maxWidth: "800px",
    margin: "0 auto",
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

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

  if (loadingInspection) {
    return (
      <main style={pageStyle}>
        <div style={contentStyle}>
          <h2>Loading saved inspection...</h2>
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // MAIN INTERFACE
  // --------------------------------------------------

  return (
    <main style={pageStyle}>
      <div style={contentStyle}>
        <h1>Home Insurance Property Capture</h1>

        <p>
          Collect property information, inspection answers,
          photos, videos, and homeowner documents.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: "#fff0f0",
              color: "#a00000",
              padding: "14px",
              borderRadius: "6px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {/* PROPERTY CREATION */}

        {!inspection && (
          <section style={sectionStyle}>
            <h2>Start New Inspection</h2>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void startInspection();
              }}
              style={{
                display: "grid",
                gap: "18px",
              }}
            >
              <label>
                Street Address *
                <input
                  style={fieldStyle}
                  value={address}
                  onChange={(e) =>
                    setAddress(e.target.value)
                  }
                  required
                />
              </label>

              <label>
                City *
                <input
                  style={fieldStyle}
                  value={city}
                  onChange={(e) =>
                    setCity(e.target.value)
                  }
                  required
                />
              </label>

              <label>
                State *
                <input
                  style={fieldStyle}
                  value={state}
                  onChange={(e) =>
                    setState(e.target.value)
                  }
                  maxLength={2}
                  required
                />
              </label>

              <label>
                ZIP Code *
                <input
                  style={fieldStyle}
                  value={postalCode}
                  onChange={(e) =>
                    setPostalCode(e.target.value)
                  }
                  required
                />
              </label>

              <label>
                Year Built
                <input
                  style={fieldStyle}
                  type="number"
                  min="1600"
                  max={new Date().getFullYear()}
                  value={yearBuilt}
                  onChange={(e) =>
                    setYearBuilt(e.target.value)
                  }
                />
              </label>

              <button
                type="submit"
                style={buttonStyle}
                disabled={creatingInspection}
              >
                {creatingInspection
                  ? "Creating..."
                  : "Start Inspection"}
              </button>
            </form>
          </section>
        )}

        {/* ACTIVE INSPECTION */}

        {inspection && (
          <>
            <section style={sectionStyle}>
              <h2>Active Inspection</h2>

              <p>
                <strong>Inspection ID:</strong>{" "}
                {inspection.id}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {inspection.status}
              </p>

              <p>
                <strong>Property ID:</strong>{" "}
                {inspection.property_id}
              </p>

              {property && (
                <p>
                  <strong>Address:</strong>{" "}
                  {property.address_line_1},{" "}
                  {property.city},{" "}
                  {property.state}{" "}
                  {property.postal_code}
                </p>
              )}

              <button
                type="button"
                style={buttonStyle}
                onClick={startNewInspection}
              >
                Start New Inspection
              </button>
            </section>

            {/* QUESTIONNAIRE */}

            {questionnaire.map((section) => (
              <section
                key={section.id}
                style={sectionStyle}
              >
                <h2>{section.title}</h2>

                <div
                  style={{
                    display: "grid",
                    gap: "20px",
                  }}
                >
                  {section.questions.map((question) => (
                    <label key={question.key}>
                      <strong>{question.label}</strong>

                      {question.type === "select" ? (
                        <select
                          style={fieldStyle}
                          value={
                            answers[question.key] || ""
                          }
                          onChange={(e) => {
                            const value = e.target.value;

                            setAnswers((previous) => ({
                              ...previous,
                              [question.key]: value,
                            }));

                            if (value) {
                              void saveAnswer(
                                question.key,
                                value
                              );
                            }
                          }}
                        >
                          <option value="">
                            Select an answer
                          </option>

                          {question.options?.map(
                            (option) => (
                              <option
                                key={option}
                                value={option}
                              >
                                {option}
                              </option>
                            )
                          )}
                        </select>
                      ) : (
                        <input
                          style={fieldStyle}
                          type={question.type}
                          value={
                            answers[question.key] || ""
                          }
                          onChange={(e) => {
                            setAnswers((previous) => ({
                              ...previous,
                              [question.key]:
                                e.target.value,
                            }));
                          }}
                          onBlur={() => {
                            void saveAnswer(
                              question.key,
                              answers[question.key] || ""
                            );
                          }}
                        />
                      )}

                      {savingAnswers[question.key] && (
                        <small
                          style={{
                            display: "block",
                            marginTop: "6px",
                          }}
                        >
                          Saving...
                        </small>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            {/* EVIDENCE UPLOADS */}

            <section style={sectionStyle}>
              <h2>Inspection Evidence</h2>

              <p>
                Upload photos, videos, or homeowner
                application and ACORD documents.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "20px",
                }}
              >
                <label>
                  <strong>Photo</strong>

                  <input
                    style={fieldStyle}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={uploading}
                    onChange={(e) => {
                      const file =
                        e.target.files?.[0];

                      if (file) {
                        void uploadFile(file);
                      }

                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <label>
                  <strong>Video</strong>

                  <input
                    style={fieldStyle}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    disabled={uploading}
                    onChange={(e) => {
                      const file =
                        e.target.files?.[0];

                      if (file) {
                        void uploadFile(file);
                      }

                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <label>
                  <strong>
                    Homeowner Application / ACORD
                  </strong>

                  <input
                    style={fieldStyle}
                    type="file"
                    accept=".pdf,image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const file =
                        e.target.files?.[0];

                      if (file) {
                        void uploadFile(file);
                      }

                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {uploading && (
                <p role="status">
                  Uploading file...
                </p>
              )}

              <h3>
                Uploaded Files ({uploadedFiles.length})
              </h3>

              {uploadedFiles.length === 0 ? (
                <p>No files uploaded yet.</p>
              ) : (
                <ul>
                  {uploadedFiles.map((file) => (
                    <li
                      key={file.id}
                      style={{
                        marginBottom: "10px",
                      }}
                    >
                      <strong>
                        {file.evidence_type}
                      </strong>
                      {" — "}
                      {file.original_filename ||
                        "Unnamed file"}

                      {file.size_bytes != null && (
                        <small>
                          {" "}
                          (
                          {file.size_bytes.toLocaleString()}{" "}
                          bytes)
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ROOM CAPTURE */}

            <section style={sectionStyle}>
              <h2>Room Capture</h2>

              <p>
                LiDAR measurements and Apple RoomPlan
                integration will be added in a future
                development step.
              </p>

              <p>
                For now, capture room photos and videos
                using the evidence section above.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
