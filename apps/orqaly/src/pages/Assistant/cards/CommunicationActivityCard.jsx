import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import BentoCard from '../../../components/Common/BentoCard';
import ActivityChart from './ActivityChart';

/**
 * Full-width console block: daily communication activity with the assistant.
 * Surfaces the shared ActivityChart once (it used to be duplicated inside the
 * Profile, Channels and Voice cards) so the page shows it in a single place.
 */
export default function CommunicationActivityCard({ activity = [] }) {
  return (
    <BentoCard title="Communication Activity" icon={ForumRoundedIcon} plainHeader scrollBody>
      <ActivityChart activity={activity} title="Messages per day" height={200} />
    </BentoCard>
  );
}
