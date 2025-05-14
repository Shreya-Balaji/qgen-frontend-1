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
    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleFileChange = (info) => {
    // Using antd's Upload component structure
    if (info.fileList.length > 0) {
      setFile(info.fileList[0].originFileObj); // Get the actual File object
    } else {
      setFile(null);
    }
    // Prevent antd's default upload behavior
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
      setJobStatus('queued'); // Initial status from backend
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
        // Keep polling if still processing or queued
        setIsLoading(true);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Error fetching job status.';
      setError(errorMsg);
      console.error('Polling error:', err);
      // Optionally stop polling on certain errors
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
    // Immediate fetch, then interval
    fetchJobStatus(currentJobId);
    pollingIntervalRef.current = setInterval(() => fetchJobStatus(currentJobId), 5000); // Poll every 5 seconds
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
          <Panel header={`Snippet ${snippet.snippet_index || index + 1} (Score: ${snippet.score?.toFixed(3) || 'N/A'}) - Source: ${snippet.source_file || 'N/A'}`} key={`${type}-${index}`}>
            <Paragraph strong>Details:</Paragraph>
            <Paragraph>
              Document ID: <Text code>{snippet.document_id || 'N/A'}</Text><br />
              Chunk Index: <Text code>{snippet.chunk_index || 'N/A'}</Text><br />
              Qdrant ID: <Text code>{snippet.qdrant_id || 'N/A'}</Text><br />
              {snippet.figure_title && <>Figure Title: <Text strong>{snippet.figure_title}</Text><br /></>}
              {snippet.headers && Object.keys(snippet.headers).length > 0 &&
                <>Headers: {Object.entries(snippet.headers).map(([k, v]) => `${k}: ${v}`).join(', ')}<br /></>
              }
            </Paragraph>
            <Paragraph strong>Text Preview:</Paragraph>
            <div className="snippet-code">{snippet.text_preview || "No text preview."}</div>
          </Panel>
        ))}
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
              beforeUpload={() => false} // Prevent auto-upload, handle manually
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
            <Checkbox>Generate PlantUML Diagrams (if applicable)</Checkbox>
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

            <Title level={5}>Evaluation Metrics:</Title>
            {jobResult.evaluation_metrics && (
              <>
                <div className="metric-item"><Text strong>QSTS Score:</Text> {jobResult.evaluation_metrics.qsts_score?.toFixed(3) || 'N/A'}</div>
                <div className="metric-item"><Text strong>LLM Answerability:</Text> {jobResult.evaluation_metrics.is_answerable_llm === true ? <Tag color="green">ANSWERABLE</Tag> : (jobResult.evaluation_metrics.is_answerable_llm === false ? <Tag color="red">NOT ANSWERABLE</Tag> : 'N/A')}</div>
                <div className="metric-item"><Text strong>LLM Reasoning:</Text> {jobResult.evaluation_metrics.answerability_reasoning_llm || 'N/A'}</div>
                 <div className="metric-item"><Text strong>Answer Context Jaccard:</Text> {jobResult.evaluation_metrics.answer_context_jaccard_overlap?.toFixed(3) || 'N/A'}</div>
                {jobResult.evaluation_metrics.qualitative && Object.entries(jobResult.evaluation_metrics.qualitative).map(([key, value]) => (
                   <div className="metric-item" key={key}><Text strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</Text> {value === true ? <Tag color="success">PASS</Tag> : (value === false ? <Tag color="error">FAIL</Tag> : 'N/A')}</div>
                ))}
              </>
            )}

            <Divider>Context Snippets</Divider>
            <Title level={5}>Generation Context (Top 5 for brevity):</Title>
            {renderContextSnippets(jobResult.generation_context_metadata?.slice(0,5), "generation")}

            <Title level={5} style={{marginTop: 20}}>Answer Context (Top 5 for brevity):</Title>
            {renderContextSnippets(jobResult.answer_context_metadata?.slice(0,5), "answer")}

          </Card>
        )}
      </Card>
    </div>
  );
}

export default App;