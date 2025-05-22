'use client';

import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import { useAuth } from '@clerk/nextjs';

// Alert severity colors
const severityColors = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  critical: 'error'
};

// Format timestamp
const formatDate = (timestamp: Timestamp) => {
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
};

// Security Alert interface
interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Timestamp;
  source: string;
  acknowledged: boolean;
  metadata?: any;
}

// Security Log interface
interface SecurityLog {
  id: string;
  userId: string;
  eventType: string;
  timestamp: Timestamp;
  ipAddress: string;
  userAgent: string;
  details: any;
}

// Dependency Scan interface
interface DependencyScan {
  id: string;
  scanDate: Timestamp;
  hasVulnerabilities: boolean;
  vulnerabilities: any[];
  npmResults: any;
  pipResults: any;
}

export default function SecurityDashboard() {
  const { isLoaded, userId } = useAuth();
  const [_isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState<number>(0);

  // Data states
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [scans, setScans] = useState<DependencyScan[]>([]);

  // Dialog states
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (isLoaded && userId) {
        try {
          // This would typically check against your user roles in Firestore
          // For demo purposes, we're just checking if the user is authenticated
          setIsAdmin(true);
          await loadData();
        } catch (err) {
          setError('You do not have permission to access this page');
          setLoading(false);
        }
      } else if (isLoaded && !userId) {
        setError('You must be logged in to access this page');
        setLoading(false);
      }
    };

    checkAdmin();
  }, [isLoaded, userId]);

  // Load data from Firestore
  const loadData = async () => {
    setLoading(true);
    try {
      // Load security alerts
      const alertsQuery = query(
        collection(db, 'securityAlerts'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const alertsSnapshot = await getDocs(alertsQuery);
      const alertsData = alertsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SecurityAlert[];
      setAlerts(alertsData);

      // Load security logs
      const logsQuery = query(
        collection(db, 'securityLogs'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const logsSnapshot = await getDocs(logsQuery);
      const logsData = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SecurityLog[];
      setLogs(logsData);

      // Load dependency scans
      const scansQuery = query(
        collection(db, 'dependencyScans'),
        orderBy('scanDate', 'desc'),
        limit(10)
      );
      const scansSnapshot = await getDocs(scansQuery);
      const scansData = scansSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DependencyScan[];
      setScans(scansData);

      setLoading(false);
    } catch (err) {
      console.error('Error loading security data:', err);
      setError('Failed to load security data');
      setLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Open details dialog
  const handleOpenDetails = (item: any) => {
    setSelectedItem(item);
    setDetailsOpen(true);
  };

  // Close details dialog
  const handleCloseDetails = () => {
    setDetailsOpen(false);
  };

  // Render loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Security Dashboard
      </Typography>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab label="Security Alerts" />
        <Tab label="Security Logs" />
        <Tab label="Dependency Scans" />
      </Tabs>

      {/* Security Alerts Tab */}
      {tabValue === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Recent Security Alerts
          </Typography>

          {alerts.length === 0 ? (
            <Alert severity="info">No security alerts found</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Severity</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Chip
                          label={alert.severity.toUpperCase()}
                          color={severityColors[alert.severity] as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{alert.title}</TableCell>
                      <TableCell>{alert.source}</TableCell>
                      <TableCell>{formatDate(alert.timestamp)}</TableCell>
                      <TableCell>
                        {alert.acknowledged ? (
                          <Chip label="Acknowledged" color="success" size="small" />
                        ) : (
                          <Chip label="New" color="primary" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleOpenDetails(alert)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Security Logs Tab */}
      {tabValue === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Recent Security Logs
          </Typography>

          {logs.length === 0 ? (
            <Alert severity="info">No security logs found</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Event Type</TableCell>
                    <TableCell>User ID</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.eventType}</TableCell>
                      <TableCell>{log.userId || 'N/A'}</TableCell>
                      <TableCell>{log.ipAddress}</TableCell>
                      <TableCell>{formatDate(log.timestamp)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleOpenDetails(log)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Dependency Scans Tab */}
      {tabValue === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Recent Dependency Scans
          </Typography>

          {scans.length === 0 ? (
            <Alert severity="info">No dependency scans found</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Scan Date</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Vulnerabilities</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell>{formatDate(scan.scanDate)}</TableCell>
                      <TableCell>
                        {scan.hasVulnerabilities ? (
                          <Chip label="Vulnerabilities Found" color="error" size="small" />
                        ) : (
                          <Chip label="Clean" color="success" size="small" />
                        )}
                      </TableCell>
                      <TableCell>{scan.vulnerabilities.length}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleOpenDetails(scan)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={handleCloseDetails} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedItem && tabValue === 0 && `Alert: ${selectedItem.title}`}
          {selectedItem && tabValue === 1 && `Log: ${selectedItem.eventType}`}
          {selectedItem && tabValue === 2 && `Scan: ${selectedItem.scanDate ? formatDate(selectedItem.scanDate) : ''}`}
        </DialogTitle>
        <DialogContent>
          {selectedItem && (
            <TextField
              label="Details"
              multiline
              rows={12}
              fullWidth
              variant="outlined"
              value={JSON.stringify(selectedItem, null, 2)}
              InputProps={{
                readOnly: true,
              }}
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
