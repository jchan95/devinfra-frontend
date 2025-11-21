import { useState, useEffect } from 'react';

function AgentDashboard() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [autoTuneRunning, setAutoTuneRunning] = useState(false);
  const [error, setError] = useState(null);

  // Fetch latest analysis on load
  useEffect(() => {
    fetchLatestConfigs();
  }, []);

  const fetchLatestConfigs = async () => {
    try {
      const response = await fetch(`${API_URL}/eval/runs/compare?eval_set_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890`);
      if (response.ok) {
        const data = await response.json();
        setConfigs(data.runs || []);
      }
    } catch (err) {
      console.error('Error fetching configs:', err);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const latestRun = configs[0];
      if (!latestRun) {
        throw new Error('No eval runs found. Run an evaluation first.');
      }
  
      const response = await fetch(`${API_URL}/agent/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eval_run_id: latestRun.eval_run_id,  // Changed from run_id
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
    
    try {
      const response = await fetch(`${API_URL}/agent/auto-tune`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspace_id: '1ddc59b8-50b1-4907-9cb9-f12e413300f5',
          eval_set_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          max_iterations: 3,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Auto-tune failed');
      }
      
      const data = await response.json();
      alert(`Auto-tune complete! Final score: ${data.final_best_score?.toFixed(2) || 'N/A'}`);
      
      // Refresh configs
      await fetchLatestConfigs();
    } catch (err) {
      setError(err.message);
    } finally {
      setAutoTuneRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '36px' }}>
        🤖 DevInfra Agent Dashboard
      </h1>
      <p style={{ textAlign: 'center', color: '#718096', marginBottom: '40px', fontSize: '18px' }}>
        Autonomous RAG Optimization System
      </p>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '40px', justifyContent: 'center' }}>
        <button
          onClick={runAnalysis}
          disabled={loading || configs.length === 0}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '🧠 Analyzing...' : '🧠 Run Analysis'}
        </button>
        
        <button
          onClick={runAutoTune}
          disabled={autoTuneRunning}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#f093fb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: autoTuneRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {autoTuneRunning ? '⚡ Auto-Tuning...' : '⚡ Run Auto-Tune'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#fee',
          borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#c00', margin: 0 }}>Error: {error}</p>
        </div>
      )}

      {/* Latest Analysis */}
      {analysis && (
        <div style={{
          padding: '30px',
          backgroundColor: '#f7fafc',
          borderRadius: '12px',
          marginBottom: '30px',
        }}>
          <h2 style={{ marginTop: 0, color: '#2d3748', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🧠 Claude's Analysis
          </h2>
          
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}>
            <h3 style={{ color: '#667eea', marginTop: 0 }}>Best Config</h3>
            <p style={{ margin: 0, color: '#4a5568' }}>{analysis.best_config || 'N/A'}</p>
          </div>

          {analysis.strengths && analysis.strengths.length > 0 && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <h3 style={{ color: '#48bb78', marginTop: 0 }}>✅ Strengths</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#4a5568' }}>
                {analysis.strengths.map((strength, idx) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{strength}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.weaknesses && analysis.weaknesses.length > 0 && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <h3 style={{ color: '#f56565', marginTop: 0 }}>⚠️ Weaknesses</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#4a5568' }}>
                {analysis.weaknesses.map((weakness, idx) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{weakness}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
            }}>
              <h3 style={{ color: '#667eea', marginTop: 0 }}>💡 Recommendations</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#4a5568' }}>
                {analysis.recommendations.map((rec, idx) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Config Comparison */}
      <div style={{ marginTop: '40px' }}>
        <h2 style={{ color: '#2d3748', marginBottom: '20px' }}>
          📊 Configuration History
        </h2>
        
        {configs.length === 0 ? (
          <div style={{
            padding: '40px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#718096',
          }}>
            <p>No evaluation runs found. Run an evaluation first!</p>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#2d3748' }}>
                      {idx === 0 && '🏆 '}
                      {config.config_name || `Config ${idx + 1}`}
                    </h3>
                    <p style={{ margin: '5px 0', color: '#718096', fontSize: '14px' }}>
                      Run ID: {config.eval_run_id?.substring(0, 8)}...
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '32px',
                      fontWeight: 'bold',
                      color: '#667eea',
                    }}>
                      {config.avg_overall?.toFixed(2) || 'N/A'}
                    </div>
                    <div style={{ fontSize: '14px', color: '#718096' }}>
                      Overall Score
                    </div>
                  </div>
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '15px',
                  marginTop: '15px',
                  paddingTop: '15px',
                  borderTop: '1px solid #e2e8f0',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>Relevance</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a5568' }}>
                      {config.avg_relevance?.toFixed(2) || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>Faithfulness</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a5568' }}>
                      {config.avg_faithfulness?.toFixed(2) || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>Completeness</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a5568' }}>
                      {config.avg_completeness?.toFixed(2) || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentDashboard;