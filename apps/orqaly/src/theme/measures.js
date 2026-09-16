/**
 * Shared layout measures.
 *
 * These are read by surfaces that do not otherwise know about each other - the
 * goal thread and the assistant chat - so they live here rather than inside
 * either one of them.
 */

/**
 * The reading column, in px.
 *
 * The hero widens to 1180px for a conversation, but a conversation is not
 * meant to be read at 1180px. One constant so the thread, the composer and the
 * run bar cannot drift apart - they previously declared this four separate
 * times and agreed only by luck.
 */
export const THREAD_MEASURE_PX = 760;

/**
 * The reading column once the goal is sent, in px.
 *
 * A form is a column; a running goal is a screen. Once the request is gone the
 * conversation stops being something to fill in and becomes something to watch,
 * and the cards it watches through - Setup, the three blocks, the phases and
 * their tasks - were being folded into 760px while the hero around them had
 * already opened to 1180. This is that same 1180, so the thread reaches the
 * edge of the surface it sits on rather than stopping short of it.
 *
 * The composer does not follow it. A box you type a sentence into is a reading
 * measure no matter how wide the screen behind it gets.
 */
export const THREAD_WIDE_MEASURE_PX = 1180;

/**
 * The landing composer, in px.
 *
 * Before there is a conversation the hero is an orb and a box to type in, and
 * that box is deliberately small - the air around it is the point. Both the
 * Goal and the Assistant landing use it, so picking one pill or the other does
 * not resize the thing you are about to type into.
 */
export const HERO_COMPOSER_MAX_WIDTH = 480;
