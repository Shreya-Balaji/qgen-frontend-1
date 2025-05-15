import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Upload, Button, Form, Input, Select, Card, Typography, Spin, Alert, Space,
  Divider, Tag, Progress, Tooltip, Collapse, Row, Col, Checkbox
} from 'antd';
import { UploadOutlined, InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import './App.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

// Configure this for your backend
const API_BASE_URL = process.env.REACT_APP_QUESTION_GEN_API_URL || 'http://localhost:8002';

const initialFormValues = {
  academic_level: "Undergraduate",
  major: "Computer Science",
  course_name: "Data Structures and Algorithms",
  taxonomy_level: "Evaluate",
  topics_list: "Breadth First Search, Shortest path",
  retrieval_limit_generation: 15,
  similarity_threshold_generation: 0.4,
  generate_diagrams: false,
};

function App() {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState('');
  const [jobMessage, setJobMessage] = useState('');
  const [jobResult, setJobResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleFileChange = (info) => {
    if (info.fileList.length > 0) {
      setFile(info.fileList[0].originFileObj);
    } else {
      setFile(null);
    }
    return false;
  };

  const resetJobState = () => {
    setJobId(null);
    setJobStatus('');
    setJobMessage('');
    setJobResult(null);
    setError('');
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
  };

  const handleSubmit = async (values) => {
    if (!file) {
      setError('Please upload a PDF file.');
      return;
    }
    resetJobState();
    setIsLoading(true);
    setUploading(true);
    setError('');
    setJobStatus('uploading');
    setJobMessage('Uploading PDF and submitting job...');

    const formData = new FormData();
    formData.append('file', file);
    Object.keys(values).forEach(key => {
      formData.append(key, values[key]);
    });

    try {
      const response = await axios.post(`${API_BASE_URL}/generate-questions`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploading(false);
      setJobId(response.data.job_id);
      setJobStatus('queued');
      setJobMessage(response.data.message);
      startPolling(response.data.job_id);
    } catch (err) {
      setUploading(false);
      setIsLoading(false);
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to submit job.';
      setError(errorMsg);
      setJobStatus('error');
      setJobMessage(errorMsg);
      console.error('Submit error:', err);
    }
  };

  const fetchJobStatus = async (currentJobId) => {
    if (!currentJobId) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/job-status/${currentJobId}`);
      const data = response.data;

      setJobStatus(data.status);
      setJobMessage(data.message);

      if (data.status === 'completed' || data.status === 'error') {
        setIsLoading(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        if (data.status === 'completed') {
          setJobResult(data.result);
        }
      } else {
        setIsLoading(true);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Error fetching job status.';
      setError(errorMsg);
      console.error('Polling error:', err);
      if (err.response?.status === 404) {
        setJobStatus('error');
        setJobMessage('Job not found. Polling stopped.');
        setIsLoading(false);
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      }
    }
  };

  const startPolling = (currentJobId) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    fetchJobStatus(currentJobId);
    pollingIntervalRef.current = setInterval(() => fetchJobStatus(currentJobId), 5000);
  };

  const renderStatusIcon = () => {
    if (isLoading && (jobStatus === 'processing' || jobStatus === 'queued' || jobStatus === 'uploading')) {
      return <Spin style={{ marginRight: 8 }} />;
    }
    switch (jobStatus) {
      case 'completed': return <CheckCircleOutlined style={{ color: 'green', marginRight: 8 }} />;
      case 'error': return <CloseCircleOutlined style={{ color: 'red', marginRight: 8 }} />;
      case 'queued':
      case 'processing':
      case 'uploading':
        return <ClockCircleOutlined style={{ color: 'orange', marginRight: 8 }} />;
      default: return null;
    }
  };

  const renderContextSnippets = (snippets, type) => {
    if (!snippets || snippets.length === 0) {
      return <Paragraph>No {type} context snippets available.</Paragraph>;
    }
    return (
      <Collapse accordion>
        {snippets.map((snippet, index) => (
          <Panel
            header={`Snippet ${index + 1} (ID: ${snippet.id || 'N/A'}, Score: ${snippet.score?.toFixed(4) || 'N/A'}) - Source: ${snippet.payload?.metadata?.source_file || 'N/A'}`}
            key={`${type}-${snippet.id || index}`}
          >
            <Paragraph strong>Details:</Paragraph>
            <Paragraph>
              Document ID (Qdrant): <Text code>{snippet.payload?.metadata?.document_id || 'N/A'}</Text><br />
              Session ID (Qdrant): <Text code>{snippet.payload?.metadata?.session_id || 'N/A'}</Text><br />
              Original Chunk Index: <Text code>{snippet.payload?.metadata?.chunk_index_original_split ?? 'N/A'}</Text><br />
              Final Chunk Index: <Text code>{snippet.payload?.metadata?.final_chunk_index ?? 'N/A'}</Text><br />
              {snippet.payload?.metadata?.header_trail && snippet.payload?.metadata?.header_trail.length > 0 &&
                <>Header Trail: <Text code>{snippet.payload.metadata.header_trail.join(' -> ')}</Text><br /></>
              }
            </Paragraph>
            <Paragraph strong>Text:</Paragraph>
            <div className="snippet-code">{snippet.payload?.text || "No text in snippet."}</div>
          </Panel>
        ))}
      </Collapse>
    );
  };

  const renderImageDescriptionSlideshow = (allSnippets) => {
    if (!allSnippets || allSnippets.length === 0) {
        return <Paragraph>No context snippets available to check for image descriptions.</Paragraph>;
    }

    const imageDescriptionSnippets = allSnippets.filter(snippet =>
        snippet.payload?.text &&
        snippet.payload.text.includes("**Figure Description (Generated by Moondream):**")
    );

    if (imageDescriptionSnippets.length === 0) {
        return <Paragraph>No distinct image descriptions found in the provided context snippets.</Paragraph>;
    }

    return (
        <Collapse accordion>
            {imageDescriptionSnippets.map((snippet, index) => {
                let title = `Image Description ${index + 1}`;
                const titleMatch = snippet.payload.text.match(/^###\s*(.*)/m);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].replace(/\*\*Figure Description \(Generated by Moondream\):\*\*/, '').trim(); // Clean title a bit
                }

                const descriptionMatch = snippet.payload.text.match(/\*\*Figure Description \(Generated by Moondream\):\*\*\s*([\s\S]*?)\s*---/m);
                const descriptionText = descriptionMatch && descriptionMatch[1] ? descriptionMatch[1].trim() : "Could not extract description text.";
                
                const originalRefMatch = snippet.payload.text.match(/\*\*Original Image Reference in Document:\*\*\s*`([^`]+)`/m);
                const originalRef = originalRefMatch && originalRefMatch[1] ? originalRefMatch[1] : "N/A";

                return (
                    <Panel header={title} key={`img-desc-${snippet.id || index}`}>
                        <Paragraph>
                            <Text strong>Original Image Reference:</Text> <Text code>{originalRef}</Text>
                        </Paragraph>
                        <Paragraph strong>Moondream Generated Description:</Paragraph>
                        <div className="snippet-code">{descriptionText}</div>
                        <Paragraph style={{marginTop: '10px', fontSize: '0.9em', color: '#777'}}>
                            (Source Snippet Score: {snippet.score?.toFixed(4) || 'N/A'}, ID: {snippet.id || 'N/A'})
                        </Paragraph>
                    </Panel>
                );
            })}
        </Collapse>
    );
};


  return (
    <div className="container">
      <Card>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 30 }}>
          Educational Question Generator
        </Title>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={initialFormValues}
        >
          <Title level={4}>1. Upload PDF Document</Title>
          <Form.Item
            name="file_upload"
            rules={[{ required: true, message: 'Please upload a PDF file!' }]}
          >
            <Upload
              name="file"
              beforeUpload={() => false}
              onChange={handleFileChange}
              maxCount={1}
              accept=".pdf"
              fileList={file ? [{ uid: '-1', name: file.name, status: 'done' }] : []}
            >
              <Button icon={<UploadOutlined />}>Click to Upload PDF</Button>
            </Upload>
          </Form.Item>
          <Divider />

          <Title level={4}>2. Configure Generation Parameters</Title>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Academic Level" name="academic_level" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Major/Field" name="major" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Course Name" name="course_name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Bloom's Taxonomy Level" name="taxonomy_level" rules={[{ required: true }]}>
            <Select>
              {["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].map(level => (
                <Option key={level} value={level}>{level}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Key Topics (comma-separated)" name="topics_list" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Retrieval Limit (Generation)" name="retrieval_limit_generation" rules={[{ required: true, type: 'number', min: 1, transform: value => Number(value) }]}>
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Similarity Threshold (Generation)" name="similarity_threshold_generation" rules={[{ required: true, type: 'number', min: 0, max: 1, transform: value => Number(value) }]}>
                <Input type="number" step="0.01" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="generate_diagrams" valuePropName="checked">
            <Checkbox>Generate PlantUML Diagrams (Feature not fully implemented in backend)</Checkbox>
             <Tooltip title="This option is present, but the backend currently focuses on Moondream text descriptions for images, not PlantUML generation.">
                <InfoCircleOutlined style={{ marginLeft: 8, color: 'rgba(0,0,0,.45)' }} />
            </Tooltip>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isLoading && !uploading} disabled={uploading} block size="large">
              {uploading ? 'Uploading...' : (isLoading ? 'Processing Job...' : 'Generate Question')}
            </Button>
          </Form.Item>
        </Form>
        <Divider />

        {error && <Alert message={error} type="error" showIcon closable onClose={() => setError('')} style={{ marginBottom: 20 }} />}

        {jobId && (
          <Card title="Job Status" className="status-card">
            <Paragraph><strong>Job ID:</strong> <Text code>{jobId}</Text></Paragraph>
            <Paragraph>
              <strong>Status:</strong> {renderStatusIcon()}
              <Tag color={
                jobStatus === 'completed' ? 'green' :
                jobStatus === 'error' ? 'red' :
                (jobStatus === 'processing' || jobStatus === 'queued' || jobStatus === 'uploading') ? 'orange' : 'default'
              }>
                {jobStatus.toUpperCase()}
              </Tag>
            </Paragraph>
            <Paragraph><strong>Message:</strong> {jobMessage || 'N/A'}</Paragraph>
            {(isLoading && (jobStatus === 'processing' || jobStatus === 'queued')) && <Progress percent={50} status="active" showInfo={false} />}
          </Card>
        )}

        {jobResult && jobStatus === 'completed' && (
          <Card title="Generated Question & Evaluation" className="result-card">
            <Title level={5}>Generated Question:</Title>
            <Paragraph className="snippet-code" style={{fontSize: '1em', padding: 15, marginBottom: 20}}>
              {jobResult.generated_question || "No question generated."}
            </Paragraph>

            <Divider>Evaluation Metrics</Divider>
            {jobResult.evaluation_metrics && (
              <>
                {jobResult.evaluation_metrics.generation_status_message && (
                    <Alert message={<><Text strong>Generation Outcome:</Text> {jobResult.evaluation_metrics.generation_status_message}</>} type="info" showIcon style={{marginBottom: 15}}/>
                )}
                <div className="metric-item">
                  <Text strong>QSTS Score:</Text> {jobResult.evaluation_metrics.qsts_score?.toFixed(4) || 'N/A'}
                </div>

                {jobResult.evaluation_metrics.llm_answerability && (
                  <>
                    <div className="metric-item">
                      <Text strong>LLM Answerable:</Text>
                      {jobResult.evaluation_metrics.llm_answerability.is_answerable === true ? <Tag color="green">ANSWERABLE</Tag> :
                       jobResult.evaluation_metrics.llm_answerability.is_answerable === false ? <Tag color="red">NOT ANSWERABLE</Tag> : 'N/A'}
                    </div>
                    <div className="metric-item">
                      <Text strong>LLM Answerability Reasoning:</Text> {jobResult.evaluation_metrics.llm_answerability.reasoning || 'N/A'}
                    </div>
                  </>
                )}

                {jobResult.evaluation_metrics.qualitative_metrics && Object.entries(jobResult.evaluation_metrics.qualitative_metrics).map(([key, value]) => (
                   <div className="metric-item" key={key}>
                     <Text strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</Text>
                     {typeof value === 'boolean' ? (value === true ? <Tag color="success">PASS</Tag> : <Tag color="error">FAIL</Tag>) : String(value)}
                   </div>
                ))}
                {jobResult.evaluation_metrics.llm_error_details && (
                    <Alert message={<><Text strong>LLM Error During Generation:</Text> {jobResult.evaluation_metrics.llm_error_details}</>} type="warning" showIcon style={{marginTop: 15}}/>
                )}
              </>
            )}

            <Divider>Image Content Descriptions</Divider>
            <Title level={5}>Image Content Descriptions (from Moondream, if present in context):</Title>
            {renderImageDescriptionSlideshow(jobResult.generation_context_snippets_metadata || [])}


            <Divider>Context Snippets</Divider>
            <Title level={5}>Generation Context Snippets (Top 5 for brevity):</Title>
            {renderContextSnippets(jobResult.generation_context_snippets_metadata?.slice(0,5), "generation")}

            <Title level={5} style={{marginTop: 20}}>Answerability Context Snippets (Top 5 for brevity):</Title>
            {renderContextSnippets(jobResult.answerability_context_snippets_metadata?.slice(0,5), "answer")}

          </Card>
        )}
      </Card>
    </div>
  );
}

export default App;