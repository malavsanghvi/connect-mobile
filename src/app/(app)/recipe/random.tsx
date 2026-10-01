import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Button, VStack } from '@/components/ui';
import { RecipeView } from '@/features/three-l/detail';
import { MembersOnly } from '@/features/three-l/media-ui';
import { useRandomPick } from '@/features/three-l/use-random-pick';
import { getMediaItem, randomMedia } from '@/lib/api/media';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Home › Recipe: a random fully Jain recipe from the community's library,
 * with "Show me another". When there is none it says why: no recipes at all,
 * or none marked fully Jain yet.
 */
export default function RandomRecipeScreen() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const { state, again } = useRandomPick(
    () => (center && member ? randomMedia(center.id, 'recipe', true) : Promise.resolve(null)),
    (id) => (center ? getMediaItem(id, center.id) : Promise.resolve(null)),
    [center?.id ?? null, member?.person.id ?? null],
    'pick a recipe',
  );
  const none = state.data === null;
  // Only asked when no fully Jain recipe came back: are there recipes at all?
  const anyRecipe = useLoad(() => (none && center && member ? randomMedia(center.id, 'recipe').then((r) => !!r) : Promise.resolve(true)), [none, center?.id, member?.person.id], 'look for recipes');

  return (
    <Screen title={t('threeL.randomRecipeTitle')}>
      {!member ? (
        <MembersOnly />
      ) : (
        <Loaded state={state}>
          {(recipe) =>
            recipe ? (
              <VStack gap={space.lg}>
                <RecipeView key={recipe.id} item={recipe} />
                <Button label={t('threeL.anotherRecipe')} tone="outlineBrown" size="md" icon="shuffle" onPress={again} busy={state.loading} />
              </VStack>
            ) : (
              <Loaded state={anyRecipe}>
                {(any) =>
                  any ? (
                    <EmptyState
                      icon="restaurant-outline"
                      title={t('media.noFullyJain')}
                      body={t('threeL.noFullyJainBody')}
                      action={{ label: t('threeL.allRecipes'), onPress: () => router.replace({ pathname: '/media/[kind]', params: { kind: 'recipe' } }) }}
                    />
                  ) : (
                    <EmptyState icon="restaurant-outline" title={t('media.empty.recipe')} />
                  )
                }
              </Loaded>
            )
          }
        </Loaded>
      )}
    </Screen>
  );
}
