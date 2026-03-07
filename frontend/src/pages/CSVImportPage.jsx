import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Upload, LogOut, ArrowLeft, FileText, CheckCircle, XCircle, AlertTriangle,
  Download, RefreshCw, ArrowRight, MapPin, Table
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CSVImportPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Preview, 4: Result
  
  // CSV Data
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  
  // Mapping
  const [template, setTemplate] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [selectedSource, setSelectedSource] = useState('csv_import');
  
  // Result
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, templateRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/import/template`)
      ]);
      
      setUser(userRes.data);
      setTemplate(templateRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      toast.error('CSV file must have at least a header row and one data row');
      return;
    }
    
    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    setCsvHeaders(headers);
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < Math.min(lines.length, 101); i++) { // Max 100 rows for preview
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });
        data.push(row);
      }
    }
    
    setCsvData(data);
    
    // Auto-map columns
    const autoMapping = {};
    headers.forEach(header => {
      const lowerHeader = header.toLowerCase().replace(/\s+/g, '_');
      if (template?.standard_columns.includes(lowerHeader)) {
        autoMapping[header] = lowerHeader;
      } else if (template?.custom_field_columns.includes(lowerHeader)) {
        autoMapping[header] = lowerHeader;
      }
    });
    setColumnMapping(autoMapping);
    
    setStep(2);
    toast.success(`Loaded ${data.length} rows from CSV`);
  };

  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    return values;
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      
      const result = await axios.post(`${API}/crm/import/csv`, {
        leads: csvData,
        column_mapping: columnMapping,
        source: selectedSource
      });
      
      setImportResult(result.data);
      setStep(4);
      toast.success(`Imported ${result.data.imported_count} leads`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['name', 'email', 'phone', 'source', 'address', 'city', 'state', 'pincode', 'notes'];
    const csv = headers.join(',') + '\n' + 
      'John Doe,john@example.com,9876543210,website,"123 Main St",Mumbai,Maharashtra,400001,Sample lead\n';
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lead_import_template.csv';
    a.click();
  };

  const allColumns = [...(template?.standard_columns || []), ...(template?.custom_field_columns || [])];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/crm-pre-sales'}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg">
              <Upload className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Import Leads</h1>
              <p className="text-xs text-gray-500">Upload CSV to import leads</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 pl-4 border-l">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-gray-500 uppercase">{user?.role?.replace('_', ' ')}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {[
            { num: 1, label: 'Upload' },
            { num: 2, label: 'Map Fields' },
            { num: 3, label: 'Preview' },
            { num: 4, label: 'Complete' }
          ].map((s, idx) => (
            <React.Fragment key={s.num}>
              <div className={`flex items-center gap-2 ${step >= s.num ? 'text-indigo-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  step >= s.num ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s.num ? <CheckCircle className="h-5 w-5" /> : s.num}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
              </div>
              {idx < 3 && (
                <div className={`w-12 h-0.5 mx-2 ${step > s.num ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-indigo-600" />
                Upload CSV File
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer"
                onClick={() => document.getElementById('csv-upload').click()}
              >
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium text-gray-700">Click to upload CSV file</p>
                <p className="text-sm text-gray-500 mt-1">or drag and drop</p>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              
              <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Download Template
              </Button>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Expected Columns:</p>
                <div className="flex flex-wrap gap-2">
                  {template?.standard_columns.map(col => (
                    <Badge key={col} variant="outline">{col}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Map Fields */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-indigo-600" />
                Map CSV Columns to Lead Fields
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {csvHeaders.map(header => (
                  <div key={header} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{header}</p>
                      <p className="text-xs text-gray-500">CSV Column</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <div className="flex-1">
                      <Select 
                        value={columnMapping[header] || ''} 
                        onValueChange={(v) => setColumnMapping({...columnMapping, [header]: v})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Map to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">-- Skip --</SelectItem>
                          {allColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label>Lead Source</Label>
                  <Select value={selectedSource} onValueChange={setSelectedSource}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {template?.source_options.map(src => (
                        <SelectItem key={src} value={src}>{src}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={() => setStep(3)} disabled={Object.keys(columnMapping).length === 0}>
                    Preview <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table className="h-5 w-5 text-indigo-600" />
                Preview Import ({csvData.length} leads)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-lg mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      {Object.entries(columnMapping).filter(([_, v]) => v).map(([csvCol, leadField]) => (
                        <th key={csvCol} className="px-3 py-2 text-left">
                          {leadField}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {csvData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        {Object.entries(columnMapping).filter(([_, v]) => v).map(([csvCol, _]) => (
                          <td key={csvCol} className="px-3 py-2">{row[csvCol] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {csvData.length > 10 && (
                <p className="text-sm text-gray-500 text-center mb-4">
                  Showing 10 of {csvData.length} rows
                </p>
              )}
              
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import {csvData.length} Leads
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Result */}
        {step === 4 && importResult && (
          <Card className="max-w-xl mx-auto">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Import Complete!</h3>
              <p className="text-gray-600 mb-6">
                Successfully imported {importResult.imported_count} leads
              </p>
              
              {importResult.error_count > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
                  <div className="flex items-center gap-2 text-yellow-700 mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="font-medium">{importResult.error_count} rows had errors</p>
                  </div>
                  <ul className="text-sm text-yellow-600 space-y-1">
                    {importResult.errors?.slice(0, 5).map((err, idx) => (
                      <li key={idx}>Row {err.row}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => {
                  setStep(1);
                  setCsvFile(null);
                  setCsvData([]);
                  setCsvHeaders([]);
                  setColumnMapping({});
                  setImportResult(null);
                }}>
                  Import More
                </Button>
                <Button onClick={() => window.location.href = '/crm-pre-sales'}>
                  View Leads
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
