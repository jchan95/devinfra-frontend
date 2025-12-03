import { useState, useEffect } from 'react';

function AgentDashboard() {
  const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const API_URL = rawApiUrl.replace(/\/+$/, '');
  const WORKSPACE_ID = '1ddc59b8-50b1-4907-9cb9-f12e413300f5'; // main demo workspace
  const EVAL_SET_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // shared eval set for configs and runs
  const EXAMPLE_QUESTIONS = [
    'How do I confirm a Stripe Payment Intent?',
    'What events does Stripe send for webhooks?',
    'How do I authenticate with the GitHub REST API?',
    'How do I create a Claude API request?',
    'What is the recommended prompt engineering workflow?',
  ];
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [autoTuneRunning, setAutoTuneRunning] = useState(false);
  const [error, setError] = useState(null);
  const [autoTuneStatus, setAutoTuneStatus] = useState('');
  const [autoTuneResult, setAutoTuneResult] = useState(null);
  const [autoTuneRuns, setAutoTuneRuns] = useState([]);
  const [selectedAutoTuneRunIndex, setSelectedAutoTuneRunIndex] = useState(null);
  const [autoTuneHistoryError, setAutoTuneHistoryError] = useState(null);
  const [activeTab, setActiveTab] = useState('system');

  // Eval runs state for Eval tab
  const [evalRuns, setEvalRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRunSummary, setSelectedRunSummary] = useState(null);
  const [runDetails, setRunDetails] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState(null);

  // Live RAG Query state
  const [liveQuestion, setLiveQuestion] = useState('');
  const [liveAnswer, setLiveAnswer] = useState(null);
  const [liveChunks, setLiveChunks] = useState([]);
  const [liveLatency, setLiveLatency] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const bestRunForAnalysis = configs.length > 0 ? configs[0] : null;
  // Helper: Human readable origin label for eval runs/configs
  const getOriginLabel = (origin) => {
    if (origin === 'agent_suggested') return 'Agent suggested config';
    if (origin === 'system_generated') return 'System generated preset';
    return 'Manual baseline config';
  };

  // Fetch data when tabs change
  useEffect(() => {
    if (activeTab === 'evalViewer') {
      fetchEvalRuns();
    }
    if (
      activeTab === 'configs' ||
      activeTab === 'agentAnalysis' ||
      activeTab === 'autoTune'
    ) {
      fetchLatestConfigs();
    }
    if (activeTab === 'autoTune') {
      fetchAutoTuneHistory();
    }
  }, [activeTab]);

  const fetchLatestConfigs = async () => {
    try {
      const response = await fetch(
        `${API_URL}/eval/runs/compare?eval_set_id=${EVAL_SET_ID}`
      );
      if (response.ok) {
        const data = await response.json();
        setConfigs(data.runs || []);
      }
    } catch (err) {
      console.error('Error fetching configs:', err);
    }
  };

  const fetchAutoTuneHistory = async () => {
    try {
      setAutoTuneHistoryError(null);
      const response = await fetch(
        `${API_URL}/agent/auto-tune/history?workspace_id=${WORKSPACE_ID}&eval_set_id=${EVAL_SET_ID}`
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to load auto tune history: ${response.status} ${text}`);
      }

      const data = await response.json();
      const runs = Array.isArray(data.runs) ? data.runs : [];
      setAutoTuneRuns(runs);
      setSelectedAutoTuneRunIndex(runs.length > 0 ? 0 : null);
    } catch (err) {
      console.error('Error fetching auto tune history:', err);
      setAutoTuneHistoryError(err.message || 'Failed to load auto tune history');
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
        const chosenRun =
        configs.find((r) => r.eval_run_id === selectedRunId) || configs[0];

      if (!chosenRun) {
        throw new Error('No eval runs found. Run an evaluation first.');
      }

      const response = await fetch(`${API_URL}/agent/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eval_run_id: chosenRun.eval_run_id,
        }),
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runAutoTune = async () => {
    setAutoTuneRunning(true);
    setError(null);
    setAutoTuneResult(null);
    setAutoTuneStatus(
      'Starting auto tuner. First it will run a fresh eval on the current best config, then ask Claude for new configs and evaluate those configs up to 3 times.'
    );

    try {
      setAutoTuneHistoryError(null);
      const response = await fetch(`${API_URL}/agent/auto-tune`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspace_id: WORKSPACE_ID,
          eval_set_id: EVAL_SET_ID,
          max_iterations: 3,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Auto tune failed: ${response.status} ${text}`);
      }

      setAutoTuneStatus(
        'Auto tuner is running evals and asking Claude for new configs. This can take a couple of minutes depending on model latency.'
      );

      const data = await response.json();
      setAutoTuneResult(data);

      setAutoTuneStatus(
        `Auto tune complete. Final score ${
          typeof data.final_score === 'number' ? data.final_score.toFixed(2) : 'N/A'
        } after ${data.total_iterations ?? 0} iteration${
          (data.total_iterations ?? 0) === 1 ? '' : 's'
        }.`
      );

      alert(
        `Auto tune complete. Final score: ${
          typeof data.final_score === 'number' ? data.final_score.toFixed(2) : 'N/A'
        }`
      );

      // Reload persistent history and configs
      await fetchAutoTuneHistory();
      await fetchLatestConfigs();
    } catch (err) {
      console.error('Error running auto tune:', err);
      setError(err.message || 'Auto tune failed');
      setAutoTuneHistoryError(err.message || 'Auto tune failed');
      setAutoTuneStatus('Auto tune failed. Check the error message above and try again.');
    } finally {
      setAutoTuneRunning(false);
    }
  };

  const runLiveQuery = async () => {
    if (!liveQuestion.trim()) {
      setLiveError('Type a question first.');
      return;
    }

    setLiveLoading(true);
    setLiveError(null);
    setLiveAnswer(null);
    setLiveChunks([]);
    setLiveLatency(null);

    try {
      const response = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspace_id: WORKSPACE_ID,
          question: liveQuestion,
          top_k: 3,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Query failed: ${response.status} ${text}`);
      }

      const data = await response.json();
      setLiveAnswer(data.answer);
      setLiveChunks(data.contexts || []);
      setLiveLatency(data.latency_ms ?? null);
    } catch (err) {
      console.error('Error running live query:', err);
      setLiveError(err.message || 'Live query failed');
    } finally {
      setLiveLoading(false);
    }
  };

  // Fetch eval runs for evalViewer tab
  const fetchEvalRuns = async () => {
    try {
      setEvalLoading(true);
      setEvalError(null);

      const response = await fetch(
        `${API_URL}/eval/runs/compare?eval_set_id=${EVAL_SET_ID}`
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to load eval runs: ${response.status} ${text}`);
      }

      const data = await response.json();
      let runs = data.runs || [];

      if (runs.length > 0) {
        // Assign stable serial numbers based on creation time
        const byCreatedAsc = [...runs].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        const idToSerial = new Map();
        byCreatedAsc.forEach((run, idx) => {
          const serial = idx + 1;
          idToSerial.set(run.eval_run_id, serial);
        });

        runs = runs.map((run) => {
          const serialNumber = idToSerial.get(run.eval_run_id);
          return {
            ...run,
            serialNumber,
            serialLabel:
              typeof serialNumber === 'number'
                ? `#${String(serialNumber).padStart(4, '0')}`
                : null,
          };
        });

        // Show newest run at the top of the list
        runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      setEvalRuns(runs);

      if (runs.length > 0) {
        const first = runs[0];
        setSelectedRunId(first.eval_run_id);
        setSelectedRunSummary(first);
        await fetchRunDetails(first.eval_run_id);
      } else {
        setSelectedRunId(null);
        setSelectedRunSummary(null);
        setRunDetails(null);
      }
    } catch (err) {
      console.error('Error fetching eval runs:', err);
      setEvalError(err.message || 'Failed to load eval runs');
    } finally {
      setEvalLoading(false);
    }
  };

  const fetchRunDetails = async (evalRunId) => {
    try {
      setEvalLoading(true);
      setEvalError(null);

      const response = await fetch(`${API_URL}/eval/runs/${evalRunId}/results`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to load eval run: ${response.status} ${text}`);
      }

      const data = await response.json();
      setRunDetails(data);
    } catch (err) {
      console.error('Error fetching eval run details:', err);
      setEvalError(err.message || 'Failed to load eval run details');
    } finally {
      setEvalLoading(false);
    }
  };

  const createEvalRunForConfig = async (pipelineConfigId) => {
    if (!pipelineConfigId) {
      setEvalError('No pipeline config id available for this run.');
      return;
    }

    try {
      setEvalLoading(true);
      setEvalError(null);

      const response = await fetch(`${API_URL}/eval/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eval_set_id: EVAL_SET_ID,
          pipeline_config_id: pipelineConfigId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Eval run failed: ${response.status} ${text}`);
      }

      const data = await response.json();

      // Refresh the eval runs list and details
      await fetchEvalRuns();
      if (data.eval_run_id) {
        await fetchRunDetails(data.eval_run_id);
      }
    } catch (err) {
      console.error('Error creating eval run:', err);
      setEvalError(err.message || 'Failed to create eval run');
    } finally {
      setEvalLoading(false);
    }
  };



  return (
    <div
      style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 20px 40px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >

      {/* Header + tabs */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: '#ffffff',
          paddingTop: '20px',
          paddingBottom: '16px',
        }}
      >
        <h1 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '36px' }}>
          🤖 DevInfra Agent Dashboard
        </h1>
        <p
          style={{
            textAlign: 'center',
            color: '#718096',
            marginBottom: '24px',
            fontSize: '18px',
          }}
        >
          Autonomous RAG Optimization System
        </p>

        {/* Static header explainer */}
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto 24px',
            padding: '20px 24px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            What this project is
          </h2>
          <p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: '14px' }}>
            This dashboard controls a full RAG evaluation and optimization pipeline. It connects to a
            FastAPI backend, Supabase, and multiple LLM APIs to run evals, score them, and
            iteratively search for better retrieval settings.
          </p>
          <h3
            style={{
              margin: '16px 0 6px',
              fontSize: '16px',
              color: '#2d3748',
            }}
          >
            Why I built it
          </h3>
          <p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: '14px' }}>
            I wanted a concrete way to learn how real RAG systems are tuned in production, from
            embeddings and vector search through evals and agent style orchestration. The goal is for
            a visitor to use the tabs here and see the full loop end to end.
          </p>
          <h3
            style={{
              margin: '16px 0 6px',
              fontSize: '16px',
              color: '#2d3748',
            }}
          >
            How it works
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#4a5568', fontSize: '14px' }}>
            <li>
              System Overview explains the architecture, from document ingestion to the auto tuning
              loop.
            </li>
            <li>
              Agent Analysis and Auto Tune tabs show how LLM agents read eval data, make
              recommendations, and search for better configs.
            </li>
            <li>
              Config Leaderboard and Insights focus on how different configurations perform over time.
            </li>
          </ul>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '4px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'system', label: 'System Overview' },
            { id: 'liveQuery', label: 'Live RAG Query' },
            { id: 'evalViewer', label: 'Eval Runs & Judge' },
            { id: 'configs', label: 'Config Leaderboard' },
            { id: 'agentAnalysis', label: 'Agent Analysis' },
            { id: 'autoTune', label: 'Auto Tune Explorer' },
            { id: 'insights', label: 'Insights Dashboard' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderBottom:
                  activeTab === tab.id ? '3px solid #667eea' : '3px solid transparent',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                color: activeTab === tab.id ? '#2d3748' : '#718096',
                fontWeight: activeTab === tab.id ? 600 : 500,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Tab content container - prevents layout jumping */}
      <div style={{ 
        flex: 1, 
        minHeight: '500px', 
        paddingTop: '20px',
        maxWidth: '1000px',
        margin: '0 auto',
        width: '100%'
      }}>
      
      {/* Tab content */}
      {activeTab === 'system' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            System Overview
          </h2>
          <p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: '14px' }}>
            DevInfra is a RAG evaluation and optimization stack. Documents are chunked and embedded
            into a vector store, queries retrieve relevant chunks, an LLM answers using that
            context, another LLM acts as a judge and scores the answers, and agent workflows
            generate and test new pipeline configs.
          </p>

          <h3
            style={{
              margin: '16px 0 8px',
              fontSize: '16px',
              color: '#2d3748',
            }}
          >
            End to end flow
          </h3>
          <ol
            style={{
              margin: 0,
              paddingLeft: '20px',
              color: '#4a5568',
              fontSize: '14px',
            }}
          >
            <li>Documents are ingested, chunked, and stored with embeddings in Supabase.</li>
            <li>When a question comes in, the system retrieves the most similar chunks.</li>
            <li>An LLM uses those chunks as context to generate an answer.</li>
            <li>A judge model scores the answer on relevance, faithfulness, and completeness.</li>
            <li>
              Scores are stored in evaluation tables and used by agents to suggest better configs.
            </li>
            <li>
              The auto tuner agent runs evals on new configs and keeps any that improve the score.
            </li>
          </ol>

          <h3
            style={{
              margin: '16px 0 8px',
              fontSize: '16px',
              color: '#2d3748',
            }}
          >
            Architecture at a glance
          </h3>
          <pre
            style={{
              backgroundColor: 'white',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              color: '#4a5568',
              overflowX: 'auto',
            }}
          >{`Docs → Chunking → Embeddings → Vector Search → LLM Answer
           ↓                        ↓
       Supabase tables        Eval Results + Logs
                                 ↓
                         Judge Model (LLM)
                                 ↓
                      Agents → New Configs
                                 ↓
                        Auto Tune Loop`}
          </pre>
        </div>
      )}

{activeTab === 'liveQuery' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            Live RAG Query
          </h2>
          <p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: '14px' }}>
            Run a live question through the DevInfra RAG stack, see which chunks are retrieved, and
            inspect the final answer.
          </p>

          {/* Workspace helper panel */}
          <div
            style={{
              margin: '0 0 20px',
              padding: '14px 16px',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '13px',
              color: '#4a5568',
              display: 'grid',
              gridTemplateColumns: '1.5fr 2fr',
              gap: '16px',
            }}
          >
            <div>
              <strong style={{ color: '#2d3748', fontSize: '13px' }}>Docs in this workspace</strong>
              <p style={{ margin: '8px 0' }}>
                This workspace pulls from a compact set of API and product docs so you can ask
                realistic developer questions and see how retrieval behaves.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                <li>Stripe Payment Intents API and guides</li>
                <li>Stripe Webhooks documentation</li>
                <li>Anthropic API getting started docs</li>
                <li>Anthropic prompt engineering guide</li>
                <li>GitHub REST API getting started</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: '#2d3748', fontSize: '13px' }}>
                Try these example questions
              </strong>
              <p style={{ margin: '8px 0 6px' }}>
                Click a suggestion to prefill the query box or type your own question.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setLiveQuestion(q)}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f7fafc',
                      fontSize: '13px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Input + button */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input
              type="text"
              value={liveQuestion}
              onChange={(e) => setLiveQuestion(e.target.value)}
              placeholder="Example: How do I confirm a Stripe Payment Intent?"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e0',
                fontSize: '14px',
              }}
            />
            <button
              onClick={runLiveQuery}
              disabled={liveLoading}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: liveLoading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {liveLoading ? 'Running...' : 'Run Query'}
            </button>
          </div>

          {/* Query level error */}
          {liveError && (
            <div
              style={{
                marginBottom: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#fed7d7',
                color: '#c53030',
                fontSize: '13px',
              }}
            >
              {liveError}
            </div>
          )}

          {/* Results */}
          {(liveAnswer || liveChunks.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '16px' }}>
              {/* Retrieved chunks */}
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  padding: '12px 14px',
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: '8px',
                    fontSize: '15px',
                    color: '#2d3748',
                  }}
                >
                  Retrieved chunks
                </h3>
                {liveChunks.length === 0 ? (
                  <p style={{ margin: 0, color: '#718096', fontSize: '13px' }}>
                    No chunks yet. Run a query above to see retrieval.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {liveChunks.map((c, idx) => (
                      <li
                        key={c.chunk_id || idx}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#f7fafc',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#4a5568',
                            marginBottom: '4px',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>Chunk {idx + 1}</span>
                          <span>
                            Similarity:{' '}
                            {typeof c.similarity === 'number'
                              ? c.similarity.toFixed(3)
                              : 'N/A'}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            color: '#2d3748',
                            maxHeight: '100px',
                            overflowY: 'auto',
                          }}
                        >
                          {c.text}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Answer panel */}
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  padding: '12px 14px',
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: '8px',
                    fontSize: '15px',
                    color: '#2d3748',
                  }}
                >
                  Model answer
                </h3>
                {liveAnswer ? (
                  <>
                    <p style={{ margin: '0 0 8px', color: '#2d3748', fontSize: '14px' }}>
                      {liveAnswer}
                    </p>
                    {liveLatency != null && (
                      <p
                        style={{
                          margin: 0,
                          color: '#718096',
                          fontSize: '12px',
                        }}
                      >
                        Latency: {liveLatency} ms
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, color: '#718096', fontSize: '13px' }}>
                    Run a query to see the answer here.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'evalViewer' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            Eval Runs and Judge
          </h2>
          <p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: '14px' }}>
            Browse completed eval runs on the left and inspect judge scores and explanations for a
            selected run on the right.
          </p>

          {/* NEW CONTEXT BLOCK */}
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              color: '#4a5568',
            }}
          >
            <strong style={{ color: '#2d3748', display: 'block', marginBottom: '6px' }}>
              How eval runs work
            </strong>
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Pick one pipeline config and one eval set.</li>
              <li>For each question in the eval set, the system runs the RAG pipeline and retrieves chunks.</li>
              <li>The model generates an answer based only on those chunks.</li>
              <li>The same model judges the answer for relevance, faithfulness, and completeness.</li>
              <li>Scores are saved per question, and averages are stored on the eval run.</li>
            </ol>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '260px 1fr',
              gap: '20px',
              alignItems: 'flex-start',
            }}
          >
            {/* Left column: runs list */}
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '12px 14px',
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: '10px',
                  fontSize: '15px',
                  color: '#2d3748',
                }}
              >
                Eval runs
              </h3>

              {evalLoading && evalRuns.length === 0 && (
                <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>Loading runs...</p>
              )}

              {evalError && (
                <p
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#c53030',
                  }}
                >
                  {evalError}
                </p>
              )}

              {!evalLoading && evalRuns.length === 0 && !evalError && (
                <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                  No completed eval runs found for this eval set.
                </p>
              )}

              {evalRuns.length > 0 && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {evalRuns.map((run) => (
                    <li key={run.eval_run_id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRunId(run.eval_run_id);
                          setSelectedRunSummary(run);
                          setEvalError(null);
                          fetchRunDetails(run.eval_run_id);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border:
                            selectedRunId === run.eval_run_id
                              ? '2px solid #667eea'
                              : '1px solid #e2e8f0',
                          backgroundColor:
                            selectedRunId === run.eval_run_id ? '#ebf4ff' : '#f7fafc',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: '4px',
                          }}
                        >
                          <span style={{ color: '#2d3748', fontWeight: 600 }}>
                            {run.serialLabel || run.config_name || run.pipeline_config_name || 'Config'}
                          </span>
                          <span style={{ color: '#667eea', fontWeight: 600 }}>
                            {typeof run.avg_overall === 'number'
                              ? run.avg_overall.toFixed(2)
                              : 'N/A'}
                          </span>
                        </div>
                        <div style={{ color: '#718096', fontSize: '12px' }}>
                          {run.completed ?? run.completed}/{run.total ?? run.total_examples} q
                        </div>
                        <div style={{ color: '#A0AEC0', fontSize: '11px', marginTop: '2px' }}>
                          {getOriginLabel(run.origin)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Right column: run details */}
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '16px 18px',
                minHeight: '260px',
              }}
            >
              {evalLoading && !runDetails && (
                <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                  Loading run details...
                </p>
              )}

              {!evalLoading && !runDetails && !evalError && (
                <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                  Select an eval run on the left to see judge scores and per question breakdown.
                </p>
              )}

              {evalError && (
                <p
                  style={{
                    margin: 0,
                    marginBottom: '8px',
                    fontSize: '13px',
                    color: '#c53030',
                  }}
                >
                  {evalError}
                </p>
              )}

              {runDetails && (
                <>
                  <div
                    style={{
                      marginBottom: '16px',
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: '10px',
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        color: '#2d3748',
                      }}
                    >
                      {selectedRunSummary?.serialLabel || selectedRunSummary?.config_name || selectedRunSummary?.pipeline_config_name || runDetails.pipeline_config_name}
                    </h3>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '13px',
                        color: '#718096',
                      }}
                    >
                      Config: {selectedRunSummary?.config_name || selectedRunSummary?.pipeline_config_name || runDetails.pipeline_config_name} · Eval set: {runDetails.eval_set_name} · Status:{' '}
                      {runDetails.status}
                      {selectedRunSummary && selectedRunSummary.origin && (
                        <> · Origin: {getOriginLabel(selectedRunSummary.origin)}</>
                      )}
                    </p>
                    {/* Button to run new eval with this config removed */}
                  </div>

                  {/* Summary metrics */}
                  {runDetails.summary_metrics && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: '10px',
                        marginBottom: '16px',
                      }}
                    >
                      {[
                        { label: 'Overall', key: 'avg_overall' },
                        { label: 'Relevance', key: 'avg_relevance' },
                        { label: 'Faithfulness', key: 'avg_faithfulness' },
                        { label: 'Completeness', key: 'avg_completeness' },
                      ].map((metric) => (
                        <div
                          key={metric.key}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: '#f7fafc',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#718096',
                              marginBottom: '4px',
                            }}
                          >
                            {metric.label}
                          </div>
                          <div
                            style={{
                              fontSize: '18px',
                              fontWeight: 'bold',
                              color: '#2d3748',
                            }}
                          >
                            {typeof runDetails.summary_metrics[metric.key] === 'number'
                              ? runDetails.summary_metrics[metric.key].toFixed(2)
                              : 'N/A'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Per question breakdown */}
                  <div
                    style={{
                      maxHeight: '360px',
                      overflowY: 'auto',
                      borderTop: '1px solid #e2e8f0',
                      paddingTop: '10px',
                    }}
                  >
                    <h4
                      style={{
                        margin: '0 0 8px',
                        fontSize: '14px',
                        color: '#2d3748',
                      }}
                    >
                      Per question judge scores
                    </h4>
                    {Array.isArray(runDetails.results) && runDetails.results.length > 0 ? (
                      <ul
                        style={{
                          listStyle: 'none',
                          margin: 0,
                          padding: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        {runDetails.results.map((row, idx) => (
                          <li
                            key={idx}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              backgroundColor: '#f9fafb',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '6px',
                                gap: '8px',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '13px',
                                  color: '#2d3748',
                                  fontWeight: 600,
                                  flex: 1,
                                }}
                              >
                                Q{idx + 1}: {row.question}
                              </div>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: '#4a5568',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                O:{row.score_overall?.toFixed(2) ?? 'N/A'} · R:
                                {row.score_relevance?.toFixed(2) ?? 'N/A'} · F:
                                {row.score_faithfulness?.toFixed(2) ?? 'N/A'} · C:
                                {row.score_completeness?.toFixed(2) ?? 'N/A'}
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: '13px',
                                color: '#4a5568',
                                marginBottom: '4px',
                              }}
                            >
                              <strong>Judge:</strong> {row.judge_explanation}
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                color: '#718096',
                                maxHeight: '80px',
                                overflowY: 'auto',
                              }}
                            >
                              <strong>Answer:</strong> {row.answer}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p
                        style={{
                          margin: 0,
                          fontSize: '13px',
                          color: '#718096',
                        }}
                      >
                        No detailed results found for this run.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'configs' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            Config Leaderboard
          </h2>
          <p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: '14px' }}>
            This leaderboard shows all evaluated pipeline configs, ordered by average overall score. Use it to compare manual, agent-suggested, and system-generated settings.
          </p>
          {configs.length === 0 ? (
            <p style={{ margin: 0, color: '#718096', fontSize: '14px' }}>
              No completed eval runs yet. Run an evaluation to see leaderboard results.
            </p>
          ) : (
            <>
              {/* Legend row */}
              <div style={{ display: 'flex', gap: '18px', alignItems: 'center', marginBottom: '14px', fontSize: '12px', color: '#718096' }}>
                <span style={{ fontWeight: 600, color: '#2d3748' }}>Legend:</span>
                <span>
                  <span style={{ color: '#2b6cb0', fontWeight: 500 }}>{getOriginLabel('manual')}</span>
                </span>
                <span>
                  <span style={{ color: '#805ad5', fontWeight: 500 }}>{getOriginLabel('agent_suggested')}</span>
                </span>
                <span>
                  <span style={{ color: '#4fd1c5', fontWeight: 500 }}>{getOriginLabel('system_generated')}</span>
                </span>
              </div>
              {/* Table-like grid */}
              {(() => {
                const sortedConfigs = [...configs].sort((a, b) => (b.avg_overall || 0) - (a.avg_overall || 0));
                // Define columns: Rank, Config, Origin, Overall, Relevance, Faithfulness, Completeness, Answered, Created
                const columns = [
                  { label: 'Rank', width: '48px' },
                  { label: 'Config', width: '1.2fr' },
                  { label: 'Origin', width: '1fr' },
                  { label: 'Overall', width: '0.9fr' },
                  { label: 'Relevance', width: '0.9fr' },
                  { label: 'Faithfulness', width: '0.9fr' },
                  { label: 'Completeness', width: '0.9fr' },
                  { label: 'Answered', width: '0.9fr' },
                  { label: 'Created', width: '1.2fr' },
                ];
                const gridTemplate = columns.map(c => c.width).join(' ');
                return (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                    {/* Header row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: gridTemplate,
                        background: '#f7fafc',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: '11px',
                        color: '#718096',
                        fontWeight: 700,
                        padding: '8px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {columns.map(col => (
                        <div key={col.label} style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}>
                          {col.label}
                        </div>
                      ))}
                    </div>
                    {/* Data rows */}
                    {sortedConfigs.map((cfg, idx) => (
                      <div
                        key={cfg.eval_run_id || cfg.config_name || idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: gridTemplate,
                          backgroundColor: idx === 0 ? '#ebf4ff' : 'white',
                          fontSize: '13px',
                          color: '#2d3748',
                          borderBottom: idx === sortedConfigs.length - 1 ? 'none' : '1px solid #e2e8f0',
                          fontWeight: idx === 0 ? 600 : 400,
                          padding: '10px 0',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ padding: '0 10px' }}>{idx + 1}</div>
                        <div style={{ padding: '0 10px', fontWeight: 500 }}>{cfg.config_name || '-'}</div>
                        <div style={{ padding: '0 10px' }}>{getOriginLabel(cfg.origin)}</div>
                        <div style={{ padding: '0 10px' }}>
                          {typeof cfg.avg_overall === 'number' ? cfg.avg_overall.toFixed(2) : 'N/A'}
                        </div>
                        <div style={{ padding: '0 10px' }}>
                          {typeof cfg.avg_relevance === 'number' ? cfg.avg_relevance.toFixed(2) : 'N/A'}
                        </div>
                        <div style={{ padding: '0 10px' }}>
                          {typeof cfg.avg_faithfulness === 'number' ? cfg.avg_faithfulness.toFixed(2) : 'N/A'}
                        </div>
                        <div style={{ padding: '0 10px' }}>
                          {typeof cfg.avg_completeness === 'number' ? cfg.avg_completeness.toFixed(2) : 'N/A'}
                        </div>
                        <div style={{ padding: '0 10px' }}>
                          {(cfg.completed ?? '-')}/{cfg.total ?? cfg.total_examples ?? '-'}
                        </div>
                        <div style={{ padding: '0 10px' }}>
                          {cfg.created_at
                            ? (() => {
                                try {
                                  return new Date(cfg.created_at).toLocaleString();
                                } catch {
                                  return '-';
                                }
                              })()
                            : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {activeTab === 'agentAnalysis' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            Agent Analysis
          </h2>
          <p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: '14px' }}>
            This agent reads eval results for a single pipeline configuration, summarizes how it is
            performing, and suggests what to change next.
          </p>

                    {/* Config selector for analysis */}
          <div
            style={{
              marginBottom: '16px',
              padding: '8px 10px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              color: '#4a5568',
            }}
          >
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: '#2d3748',
                fontWeight: 600,
              }}
            >
              Select config to analyze
            </label>
            <select
              value={selectedRunId || (configs[0]?.eval_run_id ?? '')}
              onChange={(e) => {
                const run = configs.find((r) => r.eval_run_id === e.target.value);
                if (run) {
                  setSelectedRunId(run.eval_run_id);
                  setAnalysis(null);
                }
              }}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '14px',
                backgroundColor: 'white',
              }}
            >
              {configs.map((run) => (
                <option key={run.eval_run_id} value={run.eval_run_id}>
                  {(run.serialLabel || run.config_name || 'Config')}, score{' '}
                  {typeof run.avg_overall === 'number'
                    ? run.avg_overall.toFixed(2)
                    : 'N/A'}
                </option>
              ))}
            </select>
          </div>

          {/* Context explainer */}
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              color: '#4a5568',
            }}
          >
            <strong style={{ color: '#2d3748', display: 'block', marginBottom: '6px' }}>
              What this agent does
            </strong>
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Loads one completed eval run and its scores.</li>
              <li>Looks at strengths and weaknesses across all questions.</li>
              <li>Flags documentation gaps where questions have weak coverage.</li>
              <li>Returns concrete recommendations and a narrative explanation.</li>
            </ol>
          </div>

          {/* Config selection and action */}
          <div
            style={{
              marginBottom: '18px',
              padding: '12px 14px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              color: '#4a5568',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '8px',
              }}
            >
              <div>
                <strong style={{ color: '#2d3748', display: 'block', marginBottom: '4px' }}>
                  Config being analyzed
                </strong>
                {bestRunForAnalysis ? (
                  <>
                    <div style={{ fontSize: '13px', color: '#2d3748', marginBottom: '2px' }}>
                      {bestRunForAnalysis.config_name || 'Unnamed config'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>
                      Overall score:{' '}
                      {typeof bestRunForAnalysis.avg_overall === 'number'
                        ? bestRunForAnalysis.avg_overall.toFixed(2)
                        : 'N/A'}{' '}
                      · Origin: {getOriginLabel(bestRunForAnalysis.origin)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '13px', color: '#718096' }}>
                    No completed eval runs found yet. Go to the Eval Runs tab, run an evaluation,
                    then return here.
                  </div>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={loading || !bestRunForAnalysis}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #667eea',
                    backgroundColor:
                      loading || !bestRunForAnalysis ? '#e2e8f0' : '#667eea',
                    color: loading || !bestRunForAnalysis ? '#4a5568' : 'white',
                    cursor:
                      loading || !bestRunForAnalysis ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loading ? 'Analyzing...' : 'Run analysis on this config'}
                </button>
              </div>
            </div>

            {error && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#fed7d7',
                  color: '#c53030',
                  fontSize: '12px',
                }}
              >
                {error}
              </div>
            )}

            {loading && !error && (
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '12px',
                  color: '#718096',
                }}
              >
                Analyzing the latest eval run. This uses Claude to read all judge scores and
                explanations.
              </div>
            )}
          </div>

          {/* Analysis output */}
          {analysis && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '16px',
                  marginBottom: '18px',
                }}
              >
                {/* Strengths */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '15px',
                      color: '#2d3748',
                    }}
                  >
                    Strengths
                  </h3>
                  {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 ? (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '18px',
                        fontSize: '13px',
                        color: '#4a5568',
                      }}
                    >
                      {analysis.strengths.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                      No strengths were identified in this analysis.
                    </p>
                  )}
                </div>

                {/* Weaknesses */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '15px',
                      color: '#2d3748',
                    }}
                  >
                    Weaknesses
                  </h3>
                  {Array.isArray(analysis.weaknesses) && analysis.weaknesses.length > 0 ? (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '18px',
                        fontSize: '13px',
                        color: '#4a5568',
                      }}
                    >
                      {analysis.weaknesses.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                      No weaknesses were captured in this analysis.
                    </p>
                  )}
                </div>

                {/* Documentation gaps */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '15px',
                      color: '#2d3748',
                    }}
                  >
                    Documentation gaps
                  </h3>
                  {Array.isArray(analysis.documentation_gaps) &&
                  analysis.documentation_gaps.length > 0 ? (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '18px',
                        fontSize: '13px',
                        color: '#4a5568',
                      }}
                    >
                      {analysis.documentation_gaps.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                      No documentation gaps were flagged.
                    </p>
                  )}
                </div>

                {/* Recommendations */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '15px',
                      color: '#2d3748',
                    }}
                  >
                    Recommendations
                  </h3>
                  {Array.isArray(analysis.recommendations) &&
                  analysis.recommendations.length > 0 ? (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '18px',
                        fontSize: '13px',
                        color: '#4a5568',
                      }}
                    >
                      {analysis.recommendations.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                      No recommendations were returned. Try running the analysis again after more
                      eval runs.
                    </p>
                  )}
                </div>
              </div>

              {/* Claude reasoning */}
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  color: '#4a5568',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 6px',
                    fontSize: '15px',
                    color: '#2d3748',
                  }}
                >
                  Claude reasoning
                </h3>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {analysis.claude_reasoning || 'No reasoning text was returned from the agent.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'autoTune' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            Auto Tune Explorer
          </h2>
          <p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: '14px' }}>
            This tab runs a small autonomous loop that evaluates configs, asks Claude for new ones,
            and keeps any configuration that improves the score.
          </p>

          {/* What the auto tuner does */}
          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              backgroundColor: 'white',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              color: '#4a5568',
            }}
          >
            <strong
              style={{
                color: '#2d3748',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              What the auto tuner does
            </strong>
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Picks the current best scoring config from the leaderboard.</li>
              <li>Runs a fresh eval on that config to get up to date scores.</li>
              <li>Uses an analysis agent to read scores and explanations.</li>
              <li>Asks Claude to generate a few new pipeline configs.</li>
              <li>Evaluates those new configs and compares them to the baseline.</li>
              <li>Keeps the best config and repeats for a small number of iterations.</li>
            </ol>
          </div>

          {/* Run loop + status */}
          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              backgroundColor: 'white',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ flex: 1 }}>
              <strong
                style={{
                  color: '#2d3748',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Run an auto tuning loop
              </strong>
              <p style={{ margin: 0, color: '#4a5568', fontSize: '13px' }}>
                Uses the demo workspace and shared eval set with a fixed number of iterations.
                The goal is to observe the behavior of the loop rather than expose every knob.
              </p>
              {error && (
                <p
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#c53030',
                  }}
                >
                  {error}
                </p>
              )}
              {autoTuneStatus && (
                <p
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#4a5568',
                  }}
                >
                  {autoTuneStatus}
                </p>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={runAutoTune}
                disabled={autoTuneRunning}
                style={{
                  padding: '10px 18px',
                  fontSize: '14px',
                  backgroundColor: autoTuneRunning ? '#a0aec0' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: autoTuneRunning ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {autoTuneRunning ? 'Running auto tune…' : 'Run auto tune search'}
              </button>
            </div>
          </div>

          {/* Tuning history */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'white',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '15px',
                  color: '#2d3748',
                }}
              >
                Auto tune history
              </h3>
              {autoTuneRuns.length > 0 && (
                <span style={{ fontSize: '12px', color: '#718096' }}>
                  {autoTuneRuns.length} run{autoTuneRuns.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {autoTuneHistoryError && (
              <p
                style={{
                  marginTop: 0,
                  marginBottom: '8px',
                  fontSize: '12px',
                  color: '#c53030',
                }}
              >
                {autoTuneHistoryError}
              </p>
            )}

            {autoTuneRuns.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                No auto tune runs yet. Start a search above to see how the loop behaves over time.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '260px 1fr',
                  gap: '16px',
                }}
              >
                {/* Left: list of runs */}
                <div
                  style={{
                    borderRight: '1px solid #e2e8f0',
                    paddingRight: '12px',
                  }}
                >
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {autoTuneRuns.map((run, idx) => (
                      <li key={run.id || idx}>
                        <button
                          type="button"
                          onClick={() => setSelectedAutoTuneRunIndex(idx)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border:
                              selectedAutoTuneRunIndex === idx
                                ? '2px solid #667eea'
                                : '1px solid #e2e8f0',
                            backgroundColor:
                              selectedAutoTuneRunIndex === idx ? '#ebf4ff' : '#f7fafc',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: '4px',
                            }}
                          >
                            <span style={{ color: '#2d3748', fontWeight: 600 }}>
                              Run #{autoTuneRuns.length - idx}
                            </span>
                            <span style={{ color: '#667eea', fontWeight: 600 }}>
                              {run.final_score != null
                                ? run.final_score.toFixed(2)
                                : 'N/A'}
                            </span>
                          </div>
                          <div style={{ color: '#718096', fontSize: '12px' }}>
                            Iterations: {run.total_iterations ?? 0}
                            {run.improvement != null && (
                              <>
                                {' '}
                                · Δ{' '}
                                {run.improvement >= 0 ? '+' : ''}
                                {run.improvement.toFixed(2)}
                              </>
                            )}
                          </div>
                          <div
                            style={{
                              color: '#A0AEC0',
                              fontSize: '11px',
                              marginTop: '2px',
                            }}
                          >
                            {run.completedAt &&
                              new Date(run.completedAt).toLocaleString()}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right: details for selected run */}
                <div>
                  {selectedAutoTuneRunIndex == null ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                      Select a run on the left to see its iterations and configs.
                    </p>
                  ) : (
                    (() => {
                      const selectedRun = autoTuneRuns[selectedAutoTuneRunIndex];
                      return (
                        <div>
                          <h4
                            style={{
                              marginTop: 0,
                              marginBottom: '8px',
                              fontSize: '14px',
                              color: '#2d3748',
                            }}
                          >
                            Run details
                          </h4>
                          {selectedRun.history && selectedRun.history.length > 0 ? (
                            <ul
                              style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                fontSize: '13px',
                              }}
                            >
                              {selectedRun.history.map((step) => (
                                <li
                                  key={step.iteration}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#f7fafc',
                                    border: '1px solid #e2e8f0',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <span style={{ color: '#2d3748', fontWeight: 600 }}>
                                      Iteration {step.iteration}
                                    </span>
                                    <span style={{ color: '#667eea', fontWeight: 600 }}>
                                      {step.avg_overall != null
                                        ? step.avg_overall.toFixed(2)
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div style={{ color: '#718096', fontSize: '12px' }}>
                                    Config: {step.pipeline_config_name}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p
                              style={{
                                margin: 0,
                                fontSize: '13px',
                                color: '#718096',
                              }}
                            >
                              This run completed without iteration details.
                            </p>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {autoTuneResult &&
        Array.isArray(autoTuneResult.history) &&
        autoTuneResult.history.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <strong
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: '#2d3748',
              }}
            >
              Tuning history
            </strong>
            <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#718096' }}>
              Each row is one iteration of the loop, starting from the baseline config and moving
              toward the current best config.
            </p>
            <div
              style={{
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                backgroundColor: '#f9fafb',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px minmax(0, 1fr) 80px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#4a5568',
                  borderBottom: '1px solid #e2e8f0',
                  backgroundColor: '#edf2f7',
                }}
              >
                <div>Iter</div>
                <div>Config name</div>
                <div style={{ textAlign: 'right' }}>Score</div>
              </div>
              {autoTuneResult.history.map((item, idx) => {
                const isFinal =
                  autoTuneResult.final_config_id &&
                  item.pipeline_config_id === autoTuneResult.final_config_id;
                return (
                  <div
                    key={`${item.iteration}-${item.eval_run_id}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px minmax(0, 1fr) 80px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: '#2d3748',
                      borderBottom:
                        idx === autoTuneResult.history.length - 1
                          ? 'none'
                          : '1px solid #e2e8f0',
                      backgroundColor: isFinal ? '#ebf4ff' : 'transparent',
                    }}
                  >
                    <div>#{item.iteration}</div>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.pipeline_config_name}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {typeof item.avg_overall === 'number'
                        ? item.avg_overall.toFixed(2)
                        : 'N/A'}
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#718096' }}>
              You can inspect these configs in the Config Leaderboard tab and open their runs in
              Eval Runs and Judge to see question level details.
            </p>
          </div>
        )}

      {activeTab === 'configs' && (
        <div style={{ marginTop: '20px' }}>
          <h2 style={{ color: '#2d3748', marginBottom: '20px' }}>📊 Configuration History</h2>

          {configs.length === 0 ? (
            <div
              style={{
                padding: '40px',
                backgroundColor: '#f7fafc',
                borderRadius: '12px',
                textAlign: 'center',
                color: '#718096',
              }}
            >
              <p>No evaluation runs found. Run an evaluation first.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '20px' }}>
              {configs.slice(0, 5).map((config, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '20px',
                    backgroundColor: idx === 0 ? '#e6f7e6' : 'white',
                    border: idx === 0 ? '3px solid #48bb78' : '2px solid #e2e8f0',
                    borderRadius: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, color: '#2d3748' }}>
                        {idx === 0 && '🏆 '}
                        {config.config_name || `Config ${idx + 1}`}
                      </h3>
                      <p
                        style={{
                          margin: '5px 0',
                          color: '#718096',
                          fontSize: '14px',
                        }}
                      >
                        Run ID: {config.eval_run_id?.substring(0, 8)}...
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '32px',
                          fontWeight: 'bold',
                          color: '#667eea',
                        }}
                      >
                        {config.avg_overall?.toFixed(2) || 'N/A'}
                      </div>
                      <div style={{ fontSize: '14px', color: '#718096' }}>Overall Score</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '15px',
                      marginTop: '15px',
                      paddingTop: '15px',
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', color: '#718096' }}>Relevance</div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#4a5568',
                        }}
                      >
                        {config.avg_relevance?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#718096' }}>Faithfulness</div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#4a5568',
                        }}
                      >
                        {config.avg_faithfulness?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#718096' }}>Completeness</div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#4a5568',
                        }}
                      >
                        {config.avg_completeness?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '30px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '20px',
              color: '#2d3748',
            }}
          >
            Insights Dashboard
          </h2>
          <p style={{ margin: 0, color: '#4a5568', fontSize: '14px' }}>
            Score trend charts and other insights will go here. This tab will visualize how the
            system improves over iterations and across configurations.
          </p>
        </div>
      )}

      {/* Global error message */}
      {error && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#fee',
            borderRadius: '8px',
            marginTop: '20px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#c00', margin: 0 }}>Error: {error}</p>
        </div>
      )}
      </div>  {/* Close tab content container */}
    </div>
  );
}

export default AgentDashboard;