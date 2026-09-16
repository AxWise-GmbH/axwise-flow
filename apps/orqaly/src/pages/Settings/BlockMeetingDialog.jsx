import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FormDialog from '../../components/Common/FormDialog';
import MeetingsCalendarPanel from './MeetingsCalendarPanel';

/**
 * Modal wrapper around the meetings calendar. The calendar body lives in
 * MeetingsCalendarPanel so it can also be embedded inline on the Settings page.
 */
export default function BlockMeetingDialog({ open, onClose }) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Meetings"
      subtitle="For Partners and Clients"
      icon={CalendarMonthIcon}
      maxWidth="lg"
      hideFooter
      contentDividers={false}
      contentSx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 480 }}
      paperSx={{ maxHeight: '90vh' }}
    >
      <MeetingsCalendarPanel />
    </FormDialog>
  );
}
