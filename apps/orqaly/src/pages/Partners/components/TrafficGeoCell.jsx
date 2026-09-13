import { Box, Typography } from '@mui/material';
import { COUNTRY_FLAGS } from '../../../utils/constants';

export default function TrafficGeoCell({ partner }) {
  const trafficList = partner.trafficSources || [partner.trafficSource].filter(Boolean);
  const geoList = partner.geos || [partner.geo].filter(Boolean);

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
        {trafficList.join(', ')}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {geoList.map((code) => `${COUNTRY_FLAGS[code] || '🏳️'} ${code}`).join(', ')}
      </Typography>
    </Box>
  );
}
