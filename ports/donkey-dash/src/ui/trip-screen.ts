import { isRouteOpen, ROUTE_IDS, ROUTES, TOTAL_STARS, type RouteId } from '../engine/routes';
import { isLegOpen, routeStars, starsOf, totalStars, type Progress } from '../progress';
import { button, h, icon } from './dom';
import { ICONS } from './icons';

export interface TripHandlers {
  progress: Progress;
  play(route: RouteId, leg: number): void;
  back(): void;
}

/**
 * Road Trip's map: five routes along one long road, each with three legs.
 * A route opens with enough stars; a leg once the one before it is done.
 */
export function buildTripScreen(handlers: TripHandlers) {
  const list = h('ol', { class: 'routes' });
  const total = h('p', { class: 'routes__total' });
  const element = h(
    'section',
    { class: 'screen screen--panel', 'aria-labelledby': 'trip-title', hidden: true },
    h(
      'div',
      { class: 'panel trip' },
      h(
        'header',
        { class: 'panel__head' },
        h('h2', { class: 'panel__title', id: 'trip-title' }, 'Road Trip'),
        total,
      ),
      list,
      h(
        'div',
        { class: 'panel__footer' },
        button('Back', handlers.back, 'button button--quiet', {}, icon(ICONS.back)),
      ),
    ),
  );

  const refresh = () => {
    const { progress } = handlers;
    const stars = totalStars(progress);
    total.replaceChildren(icon(ICONS.starFilled), ` ${stars} / ${TOTAL_STARS} stars`);
    list.replaceChildren(
      ...ROUTE_IDS.map((id, index) => {
        const route = ROUTES[id];
        const open = isRouteOpen(route, stars);
        return h(
          'li',
          { class: `route route--${id}${open ? '' : ' is-locked'}`, 'data-route': id },
          h('span', { class: 'route__number', 'aria-hidden': 'true' }, String(index + 1)),
          h(
            'div',
            { class: 'route__head' },
            h('h3', { class: 'route__name' }, route.name),
            h('p', { class: 'route__blurb' }, route.blurb),
            h(
              'p',
              { class: 'route__meta' },
              open
                ? `${routeStars(progress, id)} / 9 stars · ${route.newHazard}`
                : `Opens at ${route.unlockStars} stars`,
            ),
          ),
          h(
            'div',
            { class: 'route__legs' },
            ...route.legs.map((leg, legIndex) => {
              const legOpen = open && isLegOpen(progress, id, legIndex);
              const earned = starsOf(progress, id, legIndex);
              const legButton = button(
                h(
                  'span',
                  { class: 'leg__text' },
                  h('span', { class: 'leg__name' }, leg.name),
                  h(
                    'span',
                    {
                      class: 'leg__stars',
                      'aria-label': `${earned.filter(Boolean).length} of 3 stars`,
                    },
                    ...earned.map((star) => icon(star ? ICONS.starFilled : ICONS.star)),
                  ),
                ),
                () => handlers.play(id, legIndex),
                `leg${leg.boss ? ' leg--boss' : ''}`,
                { disabled: !legOpen, 'data-leg': legIndex },
                legOpen ? null : icon(ICONS.lock),
              );
              return legButton;
            }),
          ),
        );
      }),
    );
  };
  refresh();
  return { element, refresh };
}
